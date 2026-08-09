import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createCorrespondenceReplySchema } from "@/validators/correspondence";
import {
    createCorrespondenceReply,
    listCorrespondenceReplies,
} from "@/services/correspondenceService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "correspondences.read");
        const replies = await listCorrespondenceReplies(actorUser, params.id);
        return apiSuccess(replies);
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
        await requirePermission(actorUser, "correspondences.reply");
        const body = createCorrespondenceReplySchema.parse(await req.json());
        const reply = await createCorrespondenceReply(
            actorUser,
            params.id,
            body,
        );
        return apiSuccess(reply, "Gui phan hoi thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
