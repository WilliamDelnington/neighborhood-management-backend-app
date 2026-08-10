import { Comment, Request as RequestModel, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { assertCanViewRequest } from "@/services/requestService";
import { writeAuditLog } from "@/services/auditService";

async function assertCanViewRequestComments(
    actorUser: IUser,
    requestId: string,
): Promise<void> {
    const request = await RequestModel.findById(requestId);
    if (!request) throw new HttpError("Khong tim thay yeu cau", 404);
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
