import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireSession } from "@/lib/rbac";
import { listMyComplaints } from "@/services/complaintService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listMyComplaints(session.userId, page, limit);
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
