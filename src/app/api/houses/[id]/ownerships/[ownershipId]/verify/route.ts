import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { verifyHouseOwnershipSchema } from "@/validators/houseOwnership";
import {
    getHouseRecordById,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";
import { verifyHouseOwnership } from "@/services/houseOwnershipService";

export const dynamic = "force-dynamic";

/**
 * POST /api/houses/:id/ownerships/:ownershipId/verify
 * Xac thuc/tu choi mot quan he dong so huu/nguoi duoc uy quyen quan ly dang
 * cho xac thuc (waiting_verification) - dung chung permission/pham vi voi
 * xac minh Nha so (houses.verify + assertHouseRecordInScope), vi day cung la
 * mot quyet dinh anh huong toi ai duoc coi la co lien quan hop phap toi nha.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string; ownershipId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.verify");

        const houseRecord = await getHouseRecordById(params.id);
        await assertHouseRecordInScope(user, houseRecord);

        const body = verifyHouseOwnershipSchema.parse(await req.json());
        const ownership = await verifyHouseOwnership(
            user,
            params.id,
            params.ownershipId,
            body.decision,
            body.note,
        );
        return apiSuccess(ownership, "Đã cập nhật trạng thái xác thực");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
