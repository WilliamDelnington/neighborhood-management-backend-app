import { Complaint, ComplaintTimeline, type IComplaint } from "@/models";
import { HttpError } from "@/lib/response";
import { generateYearlyCode } from "@/lib/utils";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { TRANG_THAI_PHAN_ANH_LABEL } from "@/types";
import type {
    AssignComplaintInput,
    CreateComplaintInput,
    UpdateComplaintStatusInput,
} from "@/validators/complaint";

export const STAFF_ROLES_FOR_COMPLAINTS = [
    "neighborhood_leader",
    "regional_police",
    "people_committee_official",
    "admin",
] as const;

export async function createComplaint(
    userId: string,
    input: CreateComplaintInput,
) {
    const code = await generateYearlyCode(Complaint, "HB-PA");
    const complaint = await Complaint.create({
        code,
        category: input.category,
        title: input.title,
        content: input.content,
        area: input.area,
        images: input.images || [],
        status: "moi_tiep_nhan",
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
}) {
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    if (params.category) filter.category = params.category;
    if (params.search) {
        filter.$or = [
            { code: { $regex: params.search, $options: "i" } },
            { title: { $regex: params.search, $options: "i" } },
        ];
    }
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
    requester: { userId: string; isStaff: boolean },
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
