import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { addHouseOwnershipSchema } from "@/validators/houseOwnership";
import {
    getHouseRecordById,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";
import {
    addHouseOwnership,
    listHouseOwnerships,
} from "@/services/houseOwnershipService";

export const dynamic = "force-dynamic";

/**
 * GET /api/houses/:id/ownerships
 * Toan bo quan he so huu/quan ly cua mot nha so (dang active lan da ket thuc,
 * moi nhat truoc) - dung cho man chi tiet nha so hien lich su chuyen nhuong va
 * danh sach dong so huu/nguoi duoc uy quyen quan ly hien tai.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.read");

        const houseRecord = await getHouseRecordById(params.id);
        await assertHouseRecordInScope(user, houseRecord);

        const ownerships = await listHouseOwnerships(params.id);
        return apiSuccess(ownerships);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

/**
 * POST /api/houses/:id/ownerships
 * Them mot quan he so huu/quan ly moi (dong so huu, nguoi duoc uy quyen quan
 * ly, nguoi dai dien phap luat, nguoi lien he) hoac chuyen chu so huu chinh
 * (relationshipType="primary_owner" - xem addHouseOwnership/transferPrimaryOwnership).
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.update");

        const houseRecord = await getHouseRecordById(params.id);
        await assertHouseRecordInScope(user, houseRecord);

        const body = addHouseOwnershipSchema.parse(await req.json());
        const ownership = await addHouseOwnership(user, params.id, body);
        return apiSuccess(ownership, "Cap nhat quan he so huu thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
