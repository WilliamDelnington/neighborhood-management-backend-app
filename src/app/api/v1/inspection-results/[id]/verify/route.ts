import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { verifyInspectionResult } from "@/services/inspectionService";
import { inspectionReviewSchema } from "@/validators/inspection";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = inspectionReviewSchema.parse(await req.json());
        return apiSuccess(await verifyInspectionResult(actorUser, params.id, input), "Đã xác minh kết quả");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
