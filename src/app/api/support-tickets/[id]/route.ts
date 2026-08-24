import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, userHasPermission } from "@/lib/rbac";
import {
    getSupportTicketDetailForOwnerOrStaff,
    updateSupportTicket,
} from "@/services/supportTicketService";
import { updateSupportTicketSchema } from "@/validators/supportTicket";

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

/**
 * PATCH /api/support-tickets/[id]
 * Nguoi gui bo sung noi dung cho yeu cau cua chinh minh - xem
 * updateSupportTicket (tu dong quay ve "dang_xu_ly" neu dang
 * "can_bo_sung").
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const body = updateSupportTicketSchema.parse(await req.json());
        const ticket = await updateSupportTicket(actorUser, params.id, body);
        return apiSuccess(ticket, "Đã cập nhật yêu cầu hỗ trợ");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
