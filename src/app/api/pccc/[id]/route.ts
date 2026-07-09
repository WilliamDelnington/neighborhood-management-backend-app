import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireRole, requireSession, requireUser } from "@/lib/rbac";
import { updatePcccCheckSchema } from "@/validators/pccc";

export const dynamic = "force-dynamic";
import {
    deletePcccCheck,
    getPcccCheckById,
    PCCC_READ_ROLES,
    PCCC_WRITE_ROLES,
    updatePcccCheck,
} from "@/services/pcccService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...PCCC_READ_ROLES);
        const check = await getPcccCheckById(params.id);
        return apiSuccess(check);
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
        requireRole(session, ...PCCC_WRITE_ROLES);
        const actorUser = await requireUser(req);
        const body = updatePcccCheckSchema.parse(await req.json());
        const check = await updatePcccCheck(actorUser, params.id, body);
        return apiSuccess(check, "Cap nhat bien ban kiem tra PCCC thanh cong");
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
        requireRole(session, ...PCCC_WRITE_ROLES);
        await deletePcccCheck(session.userId, params.id);
        return apiSuccess(null, "Xoa bien ban kiem tra PCCC thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
