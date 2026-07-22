import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateHouseRecordSchema } from "@/validators/houseRecord";

export const dynamic = "force-dynamic";
import {
    getHouseRecordById,
    updateHouseRecord,
    deleteHouseRecord,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.read");

        const houseRecord = await getHouseRecordById(params.id);
        assertHouseRecordInScope(user, houseRecord);

        return apiSuccess(houseRecord);
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
        const user = await requireUser(req);
        await requirePermission(user, "houses.update");

        const existing = await getHouseRecordById(params.id);
        assertHouseRecordInScope(user, existing);

        const body = updateHouseRecordSchema.parse(await req.json());
        const houseRecord = await updateHouseRecord(user, params.id, body);
        return apiSuccess(houseRecord, "Cap nhat nha so thanh cong");
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
        const user = await requireUser(req);
        await requirePermission(user, "houses.delete");

        const existing = await getHouseRecordById(params.id);
        assertHouseRecordInScope(user, existing);

        await deleteHouseRecord(String(user._id), params.id);
        return apiSuccess(null, "Xoa nha so thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
