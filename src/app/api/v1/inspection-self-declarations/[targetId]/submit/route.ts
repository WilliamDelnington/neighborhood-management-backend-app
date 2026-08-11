import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { submitHouseInspectionSelfDeclaration } from "@/services/inspectionService";

export async function POST(
    req: Request,
    { params }: { params: { targetId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        return apiSuccess(
            await submitHouseInspectionSelfDeclaration(actorUser, params.targetId),
            "Đã gửi biểu mẫu tự khai",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
