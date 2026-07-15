import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requirePermission } from "@/lib/rbac";
import {
    deleteComplaint,
    getComplaintDetailForOwnerOrStaff,
    STAFF_ROLES_FOR_COMPLAINTS,
} from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        const isStaff = session.roles.some(r =>
            (STAFF_ROLES_FOR_COMPLAINTS as readonly string[]).includes(r),
        );
        const result = await getComplaintDetailForOwnerOrStaff(params.id, {
            userId: session.userId,
            isStaff,
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
