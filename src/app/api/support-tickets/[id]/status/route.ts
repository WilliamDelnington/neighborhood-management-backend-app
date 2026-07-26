import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateSupportTicketStatusSchema } from "@/validators/supportTicket";
import { updateSupportTicketStatus } from "@/services/supportTicketService";

export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "support_tickets.update_status");
        const body = updateSupportTicketStatusSchema.parse(await req.json());
        const ticket = await updateSupportTicketStatus(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(ticket, "Cap nhat trang thai thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
