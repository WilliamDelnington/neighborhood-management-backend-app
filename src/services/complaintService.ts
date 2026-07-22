import {
    Complaint,
    ComplaintTimeline,
    Household,
    Citizen,
    type IComplaint,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateYearlyCode } from "@/lib/utils";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { clusterScopeFilter } from "@/lib/rbac";
import { TRANG_THAI_PHAN_ANH_LABEL } from "@/types";
import type {
    AssignComplaintInput,
    CreateComplaintInput,
    UpdateComplaintStatusInput,
} from "@/validators/complaint";

/**
 * Suy ra cum dan cu cua nguoi tao phan anh de denormalize vao Complaint.cluster,
 * dung cho loc theo pham vi phu trach. Uu tien ho khau, roi den nhan khau (join
 * qua ho khau), cuoi cung la cum dau tien duoc phan cong (truong hop nhan vien
 * tu gui phan anh). Tra ve undefined neu khong the xac dinh (vd tai khoan chua
 * lien ket ho khau/nhan khau va khong duoc phan cong cum nao).
 */
export async function resolveComplaintCluster(
    user: IUser,
): Promise<string | undefined> {
    if (user.householdId) {
        const household = await Household.findById(user.householdId).select(
            "cluster",
        );
        if (household) return household.cluster;
    }
    if (user.citizenId) {
        const citizen = await Citizen.findById(user.citizenId).populate(
            "householdId",
            "cluster",
        );
        const household = citizen?.householdId as
            | { cluster?: string }
            | undefined;
        if (household?.cluster) return household.cluster;
    }
    if (user.assignedClusters?.length) return user.assignedClusters[0];
    return undefined;
}

/**
 * Dieu kien Mongo loc phan anh theo pham vi. Neu actor duoc cap
 * complaints.read_escalated, pham vi la "da chuyen UBND, cong voi cum duoc
 * phan cong (neu co)" - KHONG ke thua quy uoc "assignedClusters rong = khong
 * gioi han" cua clusterScopeFilter, vi day la quyen bo sung hep (danh cho
 * can bo UBND), khong phai mo khoa toan bo. Neu khong duoc cap quyen nay,
 * dung lai clusterScopeFilter nhu thuong le (rong = khong gioi han, giu nguyen
 * hanh vi hien tai cho cac tai khoan chua duoc gan cum).
 */
function complaintScopeFilter(
    actorUser: IUser,
    canReadEscalated: boolean,
): Record<string, unknown> {
    if (actorUser.roles.includes("admin")) return {};
    if (canReadEscalated) {
        const clusters = actorUser.assignedClusters || [];
        const or: Record<string, unknown>[] = [{ escalatedToCommittee: true }];
        if (clusters.length) or.push({ cluster: { $in: clusters } });
        return { $or: or };
    }
    return clusterScopeFilter(actorUser);
}

/**
 * Nem HttpError(403) neu actor khong duoc phep xem chi tiet phan anh nay
 * ngoai pham vi phu trach. Phan anh cu chua co cluster (truoc khi co tinh
 * nang nay, khong backfill duoc) van xem duoc qua link truc tiep - chi bi
 * loai khoi danh sach (xem complaintScopeFilter), khong bi chan hoan toan.
 */
export function assertComplaintInScope(
    actorUser: IUser,
    complaint: IComplaint,
    canReadEscalated: boolean,
): void {
    if (actorUser.roles.includes("admin")) return;
    const clusters = actorUser.assignedClusters || [];
    if (canReadEscalated) {
        if (complaint.escalatedToCommittee) return;
        if (
            clusters.length &&
            complaint.cluster &&
            clusters.includes(complaint.cluster)
        ) {
            return;
        }
        throw new HttpError(
            "Ban khong co quyen xem phan anh nay (ngoai pham vi phu trach)",
            403,
        );
    }
    if (!clusters.length) return;
    if (complaint.cluster && !clusters.includes(complaint.cluster)) {
        throw new HttpError(
            "Ban khong co quyen xem phan anh nay (ngoai pham vi phu trach)",
            403,
        );
    }
}

export async function createComplaint(
    actorUser: IUser,
    input: CreateComplaintInput,
) {
    const userId = String(actorUser._id);
    const code = await generateYearlyCode(Complaint, "HB-PA");
    const cluster = await resolveComplaintCluster(actorUser);
    const complaint = await Complaint.create({
        code,
        category: input.category,
        title: input.title,
        content: input.content,
        area: input.area,
        images: input.images || [],
        status: "moi_tiep_nhan",
        cluster,
        createdByUserId: userId,
    });

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: "moi_tiep_nhan",
        note: "Phản ánh đã được tiếp nhận từ Mini App",
        isPublic: true,
        actorId: userId,
    });

    await createNotification({
        title: "Phản ánh mới cần xử lý",
        body: `Mã ${code}: ${input.title}`,
        type: "complaint.created",
        targetRoles: ["neighborhood_leader", "admin"],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: userId,
    });

    return complaint;
}

export async function listComplaints(params: {
    page: number;
    limit: number;
    status?: string;
    category?: string;
    search?: string;
    allowedCategories?: string[] | null;
    actorUser: IUser;
    canReadEscalated: boolean;
}) {
    const clauses: Record<string, unknown>[] = [];
    if (params.status) clauses.push({ status: params.status });
    if (params.allowedCategories) {
        const categories = params.category
            ? params.allowedCategories.filter(c => c === params.category)
            : params.allowedCategories;
        clauses.push({ category: { $in: categories } });
    } else if (params.category) {
        clauses.push({ category: params.category });
    }
    if (params.search) {
        clauses.push({
            $or: [
                { code: { $regex: params.search, $options: "i" } },
                { title: { $regex: params.search, $options: "i" } },
            ],
        });
    }
    const scope = complaintScopeFilter(params.actorUser, params.canReadEscalated);
    if (Object.keys(scope).length > 0) clauses.push(scope);
    const filter: Record<string, unknown> =
        clauses.length > 0 ? { $and: clauses } : {};
    const [items, total] = await Promise.all([
        Complaint.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("createdByUserId", "displayName phone")
            .populate("assigneeId", "displayName"),
        Complaint.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function listMyComplaints(
    userId: string,
    page: number,
    limit: number,
) {
    const filter = { createdByUserId: userId };
    const [items, total] = await Promise.all([
        Complaint.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Complaint.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

async function getTimelineFor(complaintId: string, publicOnly: boolean) {
    const filter: Record<string, unknown> = { complaintId };
    if (publicOnly) filter.isPublic = true;
    return ComplaintTimeline.find(filter).sort({ createdAt: 1 });
}

export async function getComplaintDetailForOwnerOrStaff(
    complaintId: string,
    requester: {
        userId: string;
        isStaff: boolean;
        allowedCategories?: string[] | null;
        actorUser?: IUser;
        canReadEscalated?: boolean;
    },
) {
    const complaint = await Complaint.findById(complaintId)
        .populate("createdByUserId", "displayName phone")
        .populate("assigneeId", "displayName");
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    const isOwner =
        String(complaint.createdByUserId._id || complaint.createdByUserId) ===
        requester.userId;
    if (!requester.isStaff && !isOwner) {
        throw new HttpError("Ban khong co quyen xem phan anh nay", 403);
    }
    if (
        requester.isStaff &&
        !isOwner &&
        requester.allowedCategories &&
        !requester.allowedCategories.includes(complaint.category)
    ) {
        throw new HttpError("Ban khong co quyen xem nhom phan anh nay", 403);
    }
    if (requester.isStaff && !isOwner && requester.actorUser) {
        assertComplaintInScope(
            requester.actorUser,
            complaint,
            requester.canReadEscalated ?? false,
        );
    }

    const timeline = await getTimelineFor(complaintId, !requester.isStaff);
    const plain = complaint.toObject();
    if (!requester.isStaff) delete (plain as any).internalNotes;

    return { complaint: plain, timeline };
}

export async function getComplaintByCode(code: string) {
    const complaint = await Complaint.findOne({ code }).populate(
        "createdByUserId",
        "displayName",
    );
    if (!complaint)
        throw new HttpError("Khong tim thay phan anh voi ma nay", 404);
    const timeline = await getTimelineFor(String(complaint._id), true);
    const plain = complaint.toObject();
    delete (plain as any).internalNotes;
    return { complaint: plain, timeline };
}

export async function updateComplaintStatus(
    actorId: string,
    complaintId: string,
    input: UpdateComplaintStatusInput,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    complaint.status = input.status;
    if (input.status === "da_xu_ly" || input.status === "dong") {
        complaint.actualCompletionDate = new Date();
    }
    if (input.status === "da_chuyen_ubnd") {
        complaint.escalatedToCommittee = true;
    }
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: input.status,
        note: input.note,
        isPublic: input.isPublic,
        actorId,
    });

    await createNotification({
        title: "Cập nhật phản ánh của bạn",
        body: `Phản ánh ${complaint.code} đã chuyển sang trạng thái "${
            TRANG_THAI_PHAN_ANH_LABEL[input.status]
        }"`,
        type: "complaint.status_changed",
        targetUserIds: [complaint.createdByUserId],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "complaint.status_change",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { status: input.status },
    });

    return complaint;
}

export async function deleteComplaint(actorId: string, complaintId: string) {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    await ComplaintTimeline.deleteMany({ complaintId: complaint._id });
    await complaint.deleteOne();

    await writeAuditLog({
        actorId,
        action: "complaint.delete",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { code: complaint.code },
    });
}

export async function assignComplaint(
    actorId: string,
    complaintId: string,
    input: AssignComplaintInput,
) {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    complaint.assigneeId = input.assigneeId as any;
    if (input.expectedCompletionDate) {
        complaint.expectedCompletionDate = new Date(
            input.expectedCompletionDate,
        );
    }
    if (complaint.status === "moi_tiep_nhan") {
        complaint.status = "da_tiep_nhan";
    }
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: complaint.status,
        note: "Đã phân công người phụ trách xử lý",
        isPublic: true,
        actorId,
    });

    await createNotification({
        title: "Bạn được giao xử lý một phản ánh",
        body: `Phản ánh ${complaint.code}: ${complaint.title}`,
        type: "complaint.assigned",
        targetUserIds: [input.assigneeId],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "complaint.assign",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { assigneeId: input.assigneeId },
    });

    return complaint;
}
