import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requireInspectionFieldCheck } from "@/services/inspectionService";
import { inspectionReviewSchema } from "@/validators/inspection";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = inspectionReviewSchema.parse(await req.json());
        return apiSuccess(
            await requireInspectionFieldCheck(actorUser, params.id, input),
            "Đã chuyển sang kiểm tra thực địa",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
