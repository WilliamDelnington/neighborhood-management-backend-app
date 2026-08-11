import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { submitInspectionToWard } from "@/services/inspectionService";
import { submitInspectionToWardSchema } from "@/validators/inspection";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = submitInspectionToWardSchema.parse(await req.json());
        return apiSuccess(
            await submitInspectionToWard(actorUser, params.id, input),
            "Đã nộp tổng hợp kết quả lên Phường",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
