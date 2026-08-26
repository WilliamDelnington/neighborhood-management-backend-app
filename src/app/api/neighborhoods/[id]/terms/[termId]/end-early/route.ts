import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import {
    endNeighborhoodTermEarly,
    getNeighborhoodById,
} from "@/services/neighborhoodService";
import { endNeighborhoodTermEarlySchema } from "@/validators/neighborhood";

export const dynamic = "force-dynamic";

// Ket thuc SOM mot nhiem ky dang dien ra (IN_PROGRESS -> ENDED, endedEarly=
// true) - BAT BUOC ly do (xem endNeighborhoodTermEarlySchema). Cung quyen
// "neighborhoods.manage" voi cac thao tac nhiem ky khac (admin, secretary,
// people_committee_official) - khong tach quyen rieng.
export async function POST(
    req: Request,
    { params }: { params: { id: string; termId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        const body = endNeighborhoodTermEarlySchema.parse(await req.json());
        const term = await endNeighborhoodTermEarly(
            String(user._id),
            params.id,
            params.termId,
            body.reason,
        );
        return apiSuccess(term, "Đã kết thúc sớm nhiệm kỳ");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
