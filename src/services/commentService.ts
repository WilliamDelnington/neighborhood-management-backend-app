import { Comment, Request as RequestModel, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { userHasPermission } from "@/lib/rbac";
import { assertCanViewRequest } from "@/services/requestService";
import { getSupportTicketDetailForOwnerOrStaff } from "@/services/supportTicketService";
import { writeAuditLog } from "@/services/auditService";

async function assertCanViewRequestComments(
    actorUser: IUser,
    requestId: string,
): Promise<void> {
    const request = await RequestModel.findById(requestId);
    if (!request) throw new HttpError("Không tìm thấy yêu cầu", 404);
    await assertCanViewRequest(actorUser, request);
}

export async function listRequestComments(actorUser: IUser, requestId: string) {
    await assertCanViewRequestComments(actorUser, requestId);
    return Comment.find({ entityType: "Request", entityId: requestId })
        .sort({ createdAt: 1 })
        .populate("authorId", "displayName");
}

export async function createRequestComment(
    actorUser: IUser,
    requestId: string,
    content: string,
) {
    await assertCanViewRequestComments(actorUser, requestId);

    const comment = await Comment.create({
        entityType: "Request",
        entityId: requestId,
        authorId: actorUser._id,
        content,
    });
    await comment.populate("authorId", "displayName");

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "comment.create",
        targetModel: "Request",
        targetId: requestId,
        metadata: { commentId: comment._id },
    });

    return comment;
}

/**
 * Trao doi tren mot Yeu cau ho tro (C12) - cung mo hinh voi Request: quyen
 * xem trao doi = quyen xem chinh yeu cau (chu ho hoac nhan vien co
 * support_tickets.read, xem getSupportTicketDetailForOwnerOrStaff).
 */
async function assertCanViewSupportTicketComments(
    actorUser: IUser,
    ticketId: string,
): Promise<void> {
    const isStaff = await userHasPermission(
        actorUser,
        "support_tickets.read",
    );
    await getSupportTicketDetailForOwnerOrStaff(ticketId, {
        userId: String(actorUser._id),
        isStaff,
    });
}

export async function listSupportTicketComments(
    actorUser: IUser,
    ticketId: string,
) {
    await assertCanViewSupportTicketComments(actorUser, ticketId);
    return Comment.find({ entityType: "SupportTicket", entityId: ticketId })
        .sort({ createdAt: 1 })
        .populate("authorId", "displayName");
}

export async function createSupportTicketComment(
    actorUser: IUser,
    ticketId: string,
    content: string,
) {
    await assertCanViewSupportTicketComments(actorUser, ticketId);

    const comment = await Comment.create({
        entityType: "SupportTicket",
        entityId: ticketId,
        authorId: actorUser._id,
        content,
    });
    await comment.populate("authorId", "displayName");

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "comment.create",
        targetModel: "SupportTicket",
        targetId: ticketId,
        metadata: { commentId: comment._id },
    });

    return comment;
}
