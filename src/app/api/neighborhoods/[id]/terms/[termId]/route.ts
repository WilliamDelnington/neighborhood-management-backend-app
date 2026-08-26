import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import {
    deleteNeighborhoodTerm,
    getNeighborhoodById,
    updateNeighborhoodTerm,
} from "@/services/neighborhoodService";
import { updateNeighborhoodTermSchema } from "@/validators/neighborhood";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string; termId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        const body = updateNeighborhoodTermSchema.parse(await req.json());
        const term = await updateNeighborhoodTerm(
            String(user._id),
            params.id,
            params.termId,
            body,
        );
        return apiSuccess(term, "Cập nhật nhiệm kỳ thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

// Chi xoa duoc nhiem ky dang DRAFT (chua "cong bo") - cac trang thai khac
// chan o service layer voi 409 (xem deleteNeighborhoodTerm).
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; termId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        await deleteNeighborhoodTerm(String(user._id), params.id, params.termId);
        return apiSuccess(null, "Đã xóa nhiệm kỳ");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
