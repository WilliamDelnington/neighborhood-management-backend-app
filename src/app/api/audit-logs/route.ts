import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { listAuditLogs } from "@/services/auditService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "audit.read");

        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action") || undefined;
        const targetModel = searchParams.get("targetModel") || undefined;
        const actorId = searchParams.get("actorId") || undefined;
        const fromParam = searchParams.get("from");
        const toParam = searchParams.get("to");
        const from = fromParam ? new Date(fromParam) : undefined;
        const to = toParam ? new Date(toParam) : undefined;
        const page = Math.max(1, Number(searchParams.get("page")) || 1);
        const limit = Math.min(
            100,
            Math.max(1, Number(searchParams.get("limit")) || 20),
        );

        const result = await listAuditLogs({
            action,
            targetModel,
            actorId,
            from,
            to,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
