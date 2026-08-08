import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { updateResidentRecordSchema } from "@/validators/resident";

export const dynamic = "force-dynamic";
import {
    assertResidentRecordInScope,
    deleteResidentRecord,
    getResidentRecordById,
    updateResidentRecord,
} from "@/services/residentService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "residents.read");
        const record = await getResidentRecordById(params.id);
        assertResidentRecordInScope(actorUser, record);
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
        await requirePermission(actorUser, "residents.update");
        const existing = await getResidentRecordById(params.id);
        assertResidentRecordInScope(actorUser, existing);
        const body = updateResidentRecordSchema.parse(await req.json());
        const record = await updateResidentRecord(actorUser, params.id, body);
        return apiSuccess(record, "Cap nhat ho so cu tru thanh cong");
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
        await requirePermission(actorUser, "residents.update");
        const existing = await getResidentRecordById(params.id);
        assertResidentRecordInScope(actorUser, existing);
        await deleteResidentRecord(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa ho so cu tru thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
