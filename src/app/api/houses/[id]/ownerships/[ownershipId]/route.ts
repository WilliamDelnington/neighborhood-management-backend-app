import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { endHouseOwnershipSchema } from "@/validators/houseOwnership";
import {
    getHouseRecordById,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";
import { endHouseOwnership } from "@/services/houseOwnershipService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/houses/:id/ownerships/:ownershipId
 * Ket thuc mot quan he so huu/quan ly (khong xoa - giu lai lich su, xem
 * endHouseOwnership). Ket thuc chinh quan he primary_owner ma khong chuyen
 * ngay cho ai se lam nha so tro thanh "chua co chu" - dung transferPrimaryOwnership
 * (qua POST /api/houses/:id/ownerships voi relationshipType="primary_owner")
 * neu muon chuyen nhuong thay vi chi thu hoi.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string; ownershipId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.update");

        const houseRecord = await getHouseRecordById(params.id);
        await assertHouseRecordInScope(user, houseRecord);

        const body = endHouseOwnershipSchema.parse(await req.json());
        const ownership = await endHouseOwnership(
            user,
            params.id,
            params.ownershipId,
            body.reason,
        );
        return apiSuccess(ownership, "Da ket thuc quan he so huu");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
