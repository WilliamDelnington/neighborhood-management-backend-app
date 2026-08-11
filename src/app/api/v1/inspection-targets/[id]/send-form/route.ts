import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { sendInspectionSelfDeclaration } from "@/services/inspectionService";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        return apiSuccess(
            await sendInspectionSelfDeclaration(actorUser, params.id),
            "Đã gửi biểu mẫu tự khai",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
