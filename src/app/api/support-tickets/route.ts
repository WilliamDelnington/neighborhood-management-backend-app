import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createSupportTicketSchema } from "@/validators/supportTicket";
import {
    createSupportTicket,
    listSupportTickets,
} from "@/services/supportTicketService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "support_tickets.create");
        const body = createSupportTicketSchema.parse(await req.json());
        const ticket = await createSupportTicket(actorUser, body);
        return apiSuccess(ticket, "Gui yeu cau ho tro thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "support_tickets.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listSupportTickets({
            page,
            limit,
            status: searchParams.get("status") || undefined,
            type: searchParams.get("type") || undefined,
            search: searchParams.get("search") || undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
