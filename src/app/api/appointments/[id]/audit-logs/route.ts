import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    getAppointmentById,
    assertAppointmentInScope,
} from "@/services/appointmentService";
import { listAuditLogs } from "@/services/auditService";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointments/:id/audit-logs
 * Lich su xu ly (dat/xac nhan/tu choi/huy/doi lich/check-in/hoan
 * thanh/danh gia/vang mat) cua mot lich hen cu the - dung cho khu vuc "Lich
 * su xu ly" (19.7.14) trong man chi tiet lich hen o admin. Chi can quyen
 * appointments.read (khong phai audit.read) vi day la lich su cua rieng ban
 * ghi dang xem, giong pattern houses/:id/audit-logs.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "appointments.read");

        const appointment = await getAppointmentById(params.id);
        assertAppointmentInScope(user, appointment);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listAuditLogs({
            targetModel: "Appointment",
            targetId: params.id,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
