import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { createCommentSchema } from "@/validators/comment";
import {
    createSupportTicketComment,
    listSupportTicketComments,
} from "@/services/commentService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const comments = await listSupportTicketComments(
            actorUser,
            params.id,
        );
        return apiSuccess(comments);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = createCommentSchema.parse(await req.json());
        const comment = await createSupportTicketComment(
            actorUser,
            params.id,
            body.content,
        );
        return apiSuccess(comment, "Da gui binh luan", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
