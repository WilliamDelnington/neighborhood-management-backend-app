import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, userHasPermission } from "@/lib/rbac";
import { getSupportTicketDetailForOwnerOrStaff } from "@/services/supportTicketService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const isStaff = await userHasPermission(
            actorUser,
            "support_tickets.read",
        );
        const ticket = await getSupportTicketDetailForOwnerOrStaff(params.id, {
            userId: String(actorUser._id),
            isStaff,
        });
        return apiSuccess(ticket);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
