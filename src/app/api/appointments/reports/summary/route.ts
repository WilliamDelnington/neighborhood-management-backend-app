import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getAppointmentReportSummary } from "@/services/appointmentService";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointments/reports/summary?serviceId=&from=&to=
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.read");
        const { searchParams } = new URL(req.url);
        const result = await getAppointmentReportSummary({
            actorUser,
            serviceId: searchParams.get("serviceId") || undefined,
            from: searchParams.get("from") || undefined,
            to: searchParams.get("to") || undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
