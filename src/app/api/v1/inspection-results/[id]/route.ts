import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { getInspectionResult, updateInspectionResult } from "@/services/inspectionService";
import { updateInspectionResultSchema } from "@/validators/inspection";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requireAnyPermission(actorUser, ["inspections.read", "inspections.execute"]);
        return apiSuccess(await getInspectionResult(actorUser, params.id));
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const input = updateInspectionResultSchema.parse(await req.json());
        return apiSuccess(
            await updateInspectionResult(actorUser, params.id, input),
            "Đã cập nhật bản nháp",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
