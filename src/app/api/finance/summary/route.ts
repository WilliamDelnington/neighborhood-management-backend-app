import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { getFinanceSummary } from "@/services/financeService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");

        const { searchParams } = new URL(req.url);
        const summary = await getFinanceSummary({
            fromDate: searchParams.get("fromDate") || undefined,
            toDate: searchParams.get("toDate") || undefined,
        });
        return apiSuccess(summary);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
