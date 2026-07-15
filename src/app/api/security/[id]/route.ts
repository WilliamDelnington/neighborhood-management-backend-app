import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { updateSecurityRecordSchema } from "@/validators/security";

export const dynamic = "force-dynamic";
import {
    assertSecurityRecordInScope,
    deleteSecurityRecord,
    getSecurityRecordById,
    updateSecurityRecord,
} from "@/services/securityService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "security.read");
        const record = await getSecurityRecordById(params.id);
        assertSecurityRecordInScope(actorUser, record);
        return apiSuccess(record);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "security.update");
        const existing = await getSecurityRecordById(params.id);
        assertSecurityRecordInScope(actorUser, existing);
        const body = updateSecurityRecordSchema.parse(await req.json());
        const record = await updateSecurityRecord(actorUser, params.id, body);
        return apiSuccess(record, "Cap nhat ho so an ninh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "security.update");
        const existing = await getSecurityRecordById(params.id);
        assertSecurityRecordInScope(actorUser, existing);
        await deleteSecurityRecord(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa ho so an ninh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
