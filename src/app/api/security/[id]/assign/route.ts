import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { assignSecurityRecordSchema } from "@/validators/security";
import {
    assertSecurityRecordInScope,
    assignSecurityRecord,
    getSecurityRecordById,
} from "@/services/securityService";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "security.assign");
        const existing = await getSecurityRecordById(params.id);
        assertSecurityRecordInScope(actorUser, existing);
        const body = assignSecurityRecordSchema.parse(await req.json());
        const record = await assignSecurityRecord(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(record, "Phan cong theo doi an ninh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
