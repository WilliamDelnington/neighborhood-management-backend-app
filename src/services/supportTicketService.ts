import { SupportTicket, type ISupportTicket, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { generateYearlyCode } from "@/lib/utils";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { TRANG_THAI_YEU_CAU_HO_TRO_LABEL } from "@/types";
import type {
    CreateSupportTicketInput,
    UpdateSupportTicketStatusInput,
} from "@/validators/supportTicket";

export async function createSupportTicket(
    actorUser: IUser,
    input: CreateSupportTicketInput,
) {
    const userId = String(actorUser._id);
    const code = await generateYearlyCode(SupportTicket, "HB-HT");
    const ticket = await SupportTicket.create({
        code,
        type: input.type,
        title: input.title,
        content: input.content,
        images: input.images || [],
        deviceInfo: input.deviceInfo,
        status: "moi",
        createdByUserId: userId,
    });

    await createNotification({
        title: "Yêu cầu hỗ trợ mới",
        body: `Mã ${code}: ${input.title}`,
        type: "support_ticket.created",
        targetRoles: ["admin"],
        relatedModel: "SupportTicket",
        relatedId: ticket._id,
        createdBy: userId,
    });

    return ticket;
}

export async function listSupportTickets(params: {
    page: number;
    limit: number;
    status?: string;
    type?: string;
    search?: string;
}) {
    const clauses: Record<string, unknown>[] = [];
    if (params.status) clauses.push({ status: params.status });
    if (params.type) clauses.push({ type: params.type });
    if (params.search) {
        clauses.push({
            $or: [
                { code: { $regex: params.search, $options: "i" } },
                { title: { $regex: params.search, $options: "i" } },
            ],
        });
    }
    const filter: Record<string, unknown> =
        clauses.length > 0 ? { $and: clauses } : {};
    const [items, total] = await Promise.all([
        SupportTicket.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("createdByUserId", "displayName phone")
            .populate("respondedByUserId", "displayName"),
        SupportTicket.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function listMySupportTickets(
    userId: string,
    page: number,
    limit: number,
) {
    const filter = { createdByUserId: userId };
    const [items, total] = await Promise.all([
        SupportTicket.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        SupportTicket.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getSupportTicketDetailForOwnerOrStaff(
    ticketId: string,
    requester: { userId: string; isStaff: boolean },
) {
    const ticket = await SupportTicket.findById(ticketId)
        .populate("createdByUserId", "displayName phone")
        .populate("respondedByUserId", "displayName");
    if (!ticket) throw new HttpError("Không tìm thấy yêu cầu hỗ trợ", 404);

    const isOwner =
        String(ticket.createdByUserId._id || ticket.createdByUserId) ===
        requester.userId;
    if (!requester.isStaff && !isOwner) {
        throw new HttpError("Bạn không có quyền xem yêu cầu hỗ trợ này", 403);
    }

    return ticket;
}

/**
 * Nguoi gui bo sung thong tin cho yeu cau cua chinh minh - chi sua duoc noi
 * dung (khong doi type/tieu de). Neu dang o trang thai "can_bo_sung" (nhan
 * vien yeu cau bo sung), tu dong quay ve "dang_xu_ly" sau khi luu - cung quy
 * uoc voi Complaint.updateComplaint, khong can nhan vien lam gi them.
 */
export async function updateSupportTicket(
    actorUser: IUser,
    ticketId: string,
    patch: { content: string },
): Promise<ISupportTicket> {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new HttpError("Không tìm thấy yêu cầu hỗ trợ", 404);

    if (
        !actorUser.roles.includes("admin") &&
        String(ticket.createdByUserId) !== String(actorUser._id)
    ) {
        throw new HttpError("Bạn không có quyền sửa yêu cầu này", 403);
    }
    if (ticket.status === "dong" || ticket.status === "da_xu_ly") {
        throw new HttpError(
            "Yêu cầu đã kết thúc, không thể bổ sung thêm",
            400,
        );
    }

    ticket.content = patch.content;
    const wasWaitingForInfo = ticket.status === "can_bo_sung";
    if (wasWaitingForInfo) {
        ticket.status = "dang_xu_ly";
    }
    await ticket.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "support_ticket.update",
        targetModel: "SupportTicket",
        targetId: ticket._id,
        metadata: { content: patch.content },
    });

    return ticket;
}

export async function updateSupportTicketStatus(
    actorId: string,
    ticketId: string,
    input: UpdateSupportTicketStatusInput,
): Promise<ISupportTicket> {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new HttpError("Không tìm thấy yêu cầu hỗ trợ", 404);

    ticket.status = input.status;
    if (input.response !== undefined) {
        ticket.adminResponse = input.response;
        ticket.respondedByUserId = actorId as any;
    }
    if (input.status === "da_xu_ly" || input.status === "dong") {
        ticket.resolvedAt = new Date();
    }
    await ticket.save();

    await createNotification({
        title: "Cập nhật yêu cầu hỗ trợ của bạn",
        body: `Yêu cầu ${ticket.code} đã chuyển sang trạng thái "${
            TRANG_THAI_YEU_CAU_HO_TRO_LABEL[input.status]
        }"`,
        type: "support_ticket.status_changed",
        targetUserIds: [ticket.createdByUserId],
        relatedModel: "SupportTicket",
        relatedId: ticket._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "support_ticket.status_change",
        targetModel: "SupportTicket",
        targetId: ticket._id,
        metadata: { status: input.status },
    });

    return ticket;
}
