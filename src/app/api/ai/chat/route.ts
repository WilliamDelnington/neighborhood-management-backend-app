import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { aiChatRequestSchema } from "@/validators/aiChat";
import { sendAiChatMessage } from "@/services/aiChatService";

export const dynamic = "force-dynamic";

// Stateless: khong luu hoi thoai trong DB, client tu giu lich su va gui kem
// (`history`) moi lan goi - xem services/aiChatService.ts.
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "ai_chat.use");

        const body = aiChatRequestSchema.parse(await req.json());
        const result = await sendAiChatMessage(user, body.message, body.history ?? []);
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
