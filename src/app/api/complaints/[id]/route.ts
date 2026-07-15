import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import {
    requireUser,
    userHasPermission,
    getUserAllowedComplaintCategories,
} from "@/lib/rbac";
import { getComplaintDetailForOwnerOrStaff } from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const isStaff = await userHasPermission(actorUser, "complaints.read");
        const allowedCategories = isStaff
            ? await getUserAllowedComplaintCategories(actorUser)
            : null;
        const result = await getComplaintDetailForOwnerOrStaff(params.id, {
            userId: String(actorUser._id),
            isStaff,
            allowedCategories,
        });
        return apiSuccess(result);
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
        await requirePermission(session, "complaints.delete");
        await deleteComplaint(session.userId, params.id);
        return apiSuccess(null, "Xoa phan anh thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
