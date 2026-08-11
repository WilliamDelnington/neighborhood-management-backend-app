import { connectDB } from "@/lib/mongodb";
import { requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { assignInspectionTargets } from "@/services/inspectionService";
import { assignInspectionTargetsSchema } from "@/validators/inspection";

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = assignInspectionTargetsSchema.parse(await req.json());
        return apiSuccess(
            await assignInspectionTargets(actorUser, params.id, input),
            "Đã giao Nhà số cho cộng tác viên",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
