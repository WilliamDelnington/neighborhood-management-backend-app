import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { submitInspectionResult } from "@/services/inspectionService";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        return apiSuccess(await submitInspectionResult(actorUser, params.id), "Đã gửi kết quả rà soát");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
