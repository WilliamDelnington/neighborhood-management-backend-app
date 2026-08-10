import type mongoose from "mongoose";
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
import { areaScopeFilter } from "@/lib/rbac";
import { TRANG_THAI_PHAN_ANH_LABEL } from "@/types";
import type {
    AssignComplaintInput,
    CreateComplaintInput,
    RequestReevaluationInput,
    UpdateComplaintInput,
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
 * Tuong tu resolveComplaintCluster nhung suy ra to dan pho (neighborhoodId)
 * de denormalize vao Complaint.neighborhoodId - dung cho areaScopeFilter khi
 * actor la neighborhood_leader. Uu tien ho khau, roi den nhan khau (join qua
 * ho khau), cuoi cung la to dan pho cua chinh nguoi tao (truong hop nhan vien
 * tu gui phan anh).
 */
export async function resolveComplaintNeighborhoodId(
    user: IUser,
): Promise<mongoose.Types.ObjectId | undefined> {
    if (user.householdId) {
        const household = await Household.findById(user.householdId).select(
            "neighborhoodId",
        );
        if (household?.neighborhoodId) return household.neighborhoodId;
    }
    if (user.citizenId) {
        const citizen = await Citizen.findById(user.citizenId).populate(
            "householdId",
            "neighborhoodId",
        );
        const household = citizen?.householdId as
            | { neighborhoodId?: mongoose.Types.ObjectId }
            | undefined;
        if (household?.neighborhoodId) return household.neighborhoodId;
    }
    if (user.neighborhoodId) return user.neighborhoodId;
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
    return areaScopeFilter(actorUser);
}

/**
 * Nem HttpError(403) neu actor khong duoc phep xem chi tiet phan anh nay
 * ngoai pham vi phu trach. Voi nhan vien theo cluster (legacy): phan anh cu
 * chua co cluster van xem duoc qua link truc tiep - chi bi loai khoi danh
 * sach (xem complaintScopeFilter), khong bi chan hoan toan. Voi
 * neighborhood_leader: nguoc lai, khong xac dinh duoc pham vi (to truong
 * chua duoc gan to dan pho, hoac phan anh khong xac dinh duoc neighborhoodId)
 * nghia la TU CHOI - giong quy uoc cua Household/PcccCheck/SecurityRecord/
 * HouseRecord, khong ke thua su khoan dung cua nhanh cluster.
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
    if (
        actorUser.roles.includes("neighborhood_leader") ||
        actorUser.roles.includes("neighborhood_coleader")
    ) {
        // Khac voi cluster (quy uoc cu: khong xac dinh duoc = cho xem), voi
        // neighborhoodId dung quy uoc chat hon giong Household/PcccCheck/
        // SecurityRecord/HouseRecord: khong xac dinh duoc pham vi (to truong
        // chua duoc gan to dan pho, hoac phan anh khong xac dinh duoc
        // neighborhoodId) nghia la TU CHOI, khong phai cho qua.
        const ids = [
            actorUser.neighborhoodId,
            ...(actorUser.assignedNeighborhoodIds || []),
        ]
            .filter(Boolean)
            .map(String);
        if (
            !complaint.neighborhoodId ||
            !ids.includes(String(complaint.neighborhoodId))
        ) {
            throw new HttpError(
                "Ban khong co quyen xem phan anh nay (ngoai pham vi phu trach)",
                403,
            );
        }
        return;
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
    const neighborhoodId = await resolveComplaintNeighborhoodId(actorUser);
    const complaint = await Complaint.create({
        // Neu co draftId (xin truoc qua POST /api/complaints/draft), dung lam
        // _id de cac tai lieu da dinh kem tu form tao (FileAsset.relatedId =
        // draftId) tu dong thuoc ve phan anh nay - xem uploads/token,
        // uploads/attachments.
        _id: input.draftId,
        code,
        category: input.category,
        title: input.title,
        content: input.content,
        area: input.area,
        status: "moi_tiep_nhan",
        cluster,
        neighborhoodId,
        relatedAssetId: input.relatedAssetId,
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
    relatedAssetId?: string;
    allowedCategories?: string[] | null;
    actorUser: IUser;
    canReadEscalated: boolean;
}) {
    const clauses: Record<string, unknown>[] = [];
    if (params.status) clauses.push({ status: params.status });
    if (params.relatedAssetId) {
        clauses.push({ relatedAssetId: params.relatedAssetId });
    }
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

export type MyComplaintCounts = {
    inProgress: number;
    overdue: number;
};

const COMPLAINT_TERMINAL_STATUSES = ["hoan_thanh", "dong"];

/**
 * Dem so phan anh ma nguoi dung dang dang nhap la nguoi duoc phan cong xu ly
 * (assigneeId), chia theo dang xu ly / qua han, dung cho widget ca nhan tren
 * dashboard. Qua han la tap con cua dang xu ly (dua vao expectedCompletionDate),
 * khong phai mot trang thai rieng.
 */
export async function getMyAssignedComplaintCounts(
    userId: string,
): Promise<MyComplaintCounts> {
    const rows = await Complaint.find({
        assigneeId: userId,
        status: { $nin: COMPLAINT_TERMINAL_STATUSES },
    }).select("expectedCompletionDate");

    const now = Date.now();
    let overdue = 0;
    for (const row of rows) {
        if (row.expectedCompletionDate && row.expectedCompletionDate.getTime() < now) {
            overdue += 1;
        }
    }

    return { inProgress: rows.length, overdue };
}

async function getTimelineFor(complaintId: string, publicOnly: boolean) {
    const filter: Record<string, unknown> = { complaintId };
    if (publicOnly) filter.isPublic = true;
    return ComplaintTimeline.find(filter).sort({ createdAt: 1 });
}

export interface ComplaintReadRequester {
    userId: string;
    isStaff: boolean;
    allowedCategories?: string[] | null;
    actorUser?: IUser;
    canReadEscalated?: boolean;
}

/**
 * Nem HttpError neu requester khong duoc xem phan anh nay - chu phan anh luon
 * duoc xem; nhan vien phai co complaints.read (isStaff), dung nhom
 * (allowedCategories) va trong pham vi phu trach (assertComplaintInScope).
 * Dung chung cho getComplaintDetailForOwnerOrStaff va route liet ke tai lieu
 * dinh kem cua phan anh (xem /api/complaints/[id]/attachments).
 */
export function assertComplaintReadable(
    complaint: IComplaint,
    requester: ComplaintReadRequester,
): boolean {
    const isOwner =
        String((complaint.createdByUserId as any)?._id || complaint.createdByUserId) ===
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
    return isOwner;
}

export async function getComplaintDetailForOwnerOrStaff(
    complaintId: string,
    requester: ComplaintReadRequester,
) {
    const complaint = await Complaint.findById(complaintId)
        .populate("createdByUserId", "displayName phone")
        .populate("assigneeId", "displayName");
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    assertComplaintReadable(complaint, requester);

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

    // "hoan_thanh" la nguoi gui phan anh TU XAC NHAN hai long - nhan vien
    // khong duoc dat trang thai nay thay ho, xem confirmComplaintResolution.
    if (input.status === "hoan_thanh") {
        throw new HttpError(
            "Trang thai nay chi nguoi gui phan anh moi duoc xac nhan",
            400,
        );
    }

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

/**
 * Nem HttpError(403) neu actorUser khong phai chinh nguoi da gui phan anh nay
 * (khong co ngoai le cho admin - ba hanh dong duoi day the hien y kien THUC
 * SU cua nguoi gui, gia mao se lam sai lech du lieu).
 */
function assertIsComplaintSender(complaint: IComplaint, actorUser: IUser): void {
    if (String(complaint.createdByUserId) !== String(actorUser._id)) {
        throw new HttpError(
            "Chi nguoi gui phan anh nay moi duoc thuc hien hanh dong nay",
            403,
        );
    }
}

const EDITABLE_COMPLAINT_FIELDS = ["category", "title", "content"] as const;

export async function updateComplaint(
    actorUser: IUser,
    complaintId: string,
    patch: UpdateComplaintInput,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    if (
        !actorUser.roles.includes("admin") &&
        String(complaint.createdByUserId) !== String(actorUser._id)
    ) {
        throw new HttpError("Ban khong co quyen sua phan anh nay", 403);
    }
    if (complaint.status === "dong" || complaint.status === "hoan_thanh") {
        throw new HttpError(
            "Phan anh da ket thuc, khong the chinh sua noi dung",
            400,
        );
    }

    const previousSnapshot: Record<string, unknown> = {};
    const appliedPatch: Record<string, unknown> = {};
    for (const field of EDITABLE_COMPLAINT_FIELDS) {
        if (patch[field] === undefined) continue;
        previousSnapshot[field] = complaint[field];
        appliedPatch[field] = patch[field];
        (complaint as unknown as Record<string, unknown>)[field] = patch[field];
    }

    // Nguoi gui bo sung thong tin -> tu dong quay ve dang_xu_ly (khong can
    // nhan vien lam gi them) - hardcode dang_xu_ly, cung quy uoc voi
    // requestComplaintReevaluation, khong luu/tra ve trang thai truoc do.
    const wasWaitingForInfo = complaint.status === "can_bo_sung";
    if (wasWaitingForInfo) {
        complaint.status = "dang_xu_ly";
    }
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: complaint.status,
        action: "edited",
        patch: appliedPatch,
        previousSnapshot,
        isPublic: true,
        actorId: actorUser._id,
    });
    if (wasWaitingForInfo) {
        await ComplaintTimeline.create({
            complaintId: complaint._id,
            status: "dang_xu_ly",
            action: "status_update",
            isPublic: true,
            actorId: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "complaint.update",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: appliedPatch,
    });

    return complaint;
}

export async function confirmComplaintResolution(
    actorUser: IUser,
    complaintId: string,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);
    assertIsComplaintSender(complaint, actorUser);
    if (complaint.status !== "da_xu_ly") {
        throw new HttpError(
            "Chi xac nhan hoan thanh khi phan anh da duoc xu ly",
            400,
        );
    }

    complaint.status = "hoan_thanh";
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: "hoan_thanh",
        action: "status_update",
        isPublic: true,
        actorId: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "complaint.confirm_resolution",
        targetModel: "Complaint",
        targetId: complaint._id,
    });

    return complaint;
}

export async function requestComplaintReevaluation(
    actorUser: IUser,
    complaintId: string,
    input: RequestReevaluationInput,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);
    assertIsComplaintSender(complaint, actorUser);
    if (complaint.status !== "da_xu_ly") {
        throw new HttpError(
            "Chi de nghi xem xet lai khi phan anh da duoc xu ly",
            400,
        );
    }
    const usedCount = await ComplaintTimeline.countDocuments({
        complaintId: complaint._id,
        action: "reevaluation_request",
    });
    if (usedCount > 0) {
        throw new HttpError(
            "Phan anh nay da duoc de nghi xem xet lai truoc do, khong the gui them",
            400,
        );
    }

    complaint.status = "dang_xu_ly";
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: "dang_xu_ly",
        action: "reevaluation_request",
        note: input.note,
        isPublic: true,
        actorId: actorUser._id,
    });

    await createNotification({
        title: "Phản ánh cần xem xét lại",
        body: `Phản ánh ${complaint.code} bị đề nghị xem xét lại: ${input.note}`,
        type: "complaint.reevaluation_requested",
        targetRoles: ["admin", "secretary", "neighborhood_leader"],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "complaint.request_reevaluation",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { note: input.note },
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
