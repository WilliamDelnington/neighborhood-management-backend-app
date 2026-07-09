import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireRole, requireSession, requireUser } from "@/lib/rbac";
import { updateSecurityRecordSchema } from "@/validators/security";

export const dynamic = "force-dynamic";
import {
    deleteSecurityRecord,
    getSecurityRecordById,
    SECURITY_READ_ROLES,
    SECURITY_WRITE_ROLES,
    updateSecurityRecord,
} from "@/services/securityService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...SECURITY_READ_ROLES);
        const record = await getSecurityRecordById(params.id);
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
        const session = requireSession(req);
        requireRole(session, ...SECURITY_WRITE_ROLES);
        const actorUser = await requireUser(req);
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
        const session = requireSession(req);
        requireRole(session, ...SECURITY_WRITE_ROLES);
        await deleteSecurityRecord(session.userId, params.id);
        return apiSuccess(null, "Xoa ho so an ninh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
