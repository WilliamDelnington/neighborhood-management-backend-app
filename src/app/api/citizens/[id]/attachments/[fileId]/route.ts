import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { Citizen, Household } from "@/models";
import { assertHouseholdInScope } from "@/services/householdService";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/citizens/:id/attachments/:fileId
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "citizens.update");

        const citizen = await Citizen.findById(params.id);
        if (!citizen) throw new HttpError("Khong tim thay nhan khau", 404);
        const household = await Household.findById(citizen.householdId);
        if (household) await assertHouseholdInScope(user, household);

        await deleteAttachment(
            String(user._id),
            "Citizen",
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xoa tai lieu dinh kem thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
