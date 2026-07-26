import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { assignPcccCheckSchema } from "@/validators/pccc";
import {
    assertPcccCheckInScope,
    assignPcccCheck,
    getPcccCheckById,
} from "@/services/pcccService";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "pccc.assign");
        const existing = await getPcccCheckById(params.id);
        assertPcccCheckInScope(actorUser, existing);
        const body = assignPcccCheckSchema.parse(await req.json());
        const check = await assignPcccCheck(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(check, "Phan cong xu ly PCCC thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
