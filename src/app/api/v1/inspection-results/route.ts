import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { createInspectionResult } from "@/services/inspectionService";
import { saveInspectionResultSchema } from "@/validators/inspection";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = saveInspectionResultSchema.parse(await req.json());
        return apiSuccess(
            await createInspectionResult(actorUser, input),
            "Đã lưu bản nháp kết quả",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
