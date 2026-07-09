import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { createComplaintSchema } from "@/validators/complaint";

export const dynamic = "force-dynamic";
import {
    createComplaint,
    listComplaints,
    STAFF_ROLES_FOR_COMPLAINTS,
} from "@/services/complaintService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        const body = createComplaintSchema.parse(await req.json());
        const complaint = await createComplaint(session.userId, body);
        return apiSuccess(complaint, "Gui phan anh thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...STAFF_ROLES_FOR_COMPLAINTS);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listComplaints({
            page,
            limit,
            status: searchParams.get("status") || undefined,
            category: searchParams.get("category") || undefined,
            search: searchParams.get("search") || undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
