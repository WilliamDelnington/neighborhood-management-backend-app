import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import {
    requireUser,
    userHasPermission,
    requirePermission,
    getUserAllowedComplaintCategories,
} from "@/lib/rbac";
import {
    getComplaintDetailForOwnerOrStaff,
    deleteComplaint,
    updateComplaint,
} from "@/services/complaintService";
import { updateComplaintSchema } from "@/validators/complaint";

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
        const canReadEscalated = isStaff
            ? await userHasPermission(actorUser, "complaints.read_escalated")
            : false;
        const result = await getComplaintDetailForOwnerOrStaff(params.id, {
            userId: String(actorUser._id),
            isStaff,
            allowedCategories,
            actorUser: isStaff ? actorUser : undefined,
            canReadEscalated,
        });
        return apiSuccess(result);
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
        await requirePermission(actorUser, "complaints.update_own");
        const body = updateComplaintSchema.parse(await req.json());
        const complaint = await updateComplaint(actorUser, params.id, body);
        return apiSuccess(complaint, "Cập nhật phản ánh thành công");
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
        await requirePermission(actorUser, "complaints.delete");
        await deleteComplaint(String(actorUser._id), params.id);
        return apiSuccess(null, "Xóa phản ánh thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
