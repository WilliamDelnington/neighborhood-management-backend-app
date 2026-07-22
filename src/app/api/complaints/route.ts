import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import {
    requireUser,
    requirePermission,
    userHasPermission,
    getUserAllowedComplaintCategories,
} from "@/lib/rbac";
import { createComplaintSchema } from "@/validators/complaint";

export const dynamic = "force-dynamic";
import { createComplaint, listComplaints } from "@/services/complaintService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.create");
        const body = createComplaintSchema.parse(await req.json());
        const complaint = await createComplaint(actorUser, body);
        return apiSuccess(complaint, "Gui phan anh thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaints.read");
        const allowedCategories =
            await getUserAllowedComplaintCategories(actorUser);
        const canReadEscalated = await userHasPermission(
            actorUser,
            "complaints.read_escalated",
        );

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listComplaints({
            page,
            limit,
            status: searchParams.get("status") || undefined,
            category: searchParams.get("category") || undefined,
            search: searchParams.get("search") || undefined,
            allowedCategories,
            actorUser,
            canReadEscalated,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
