import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    listAppointmentHolidays,
    createAppointmentHoliday,
} from "@/services/appointmentHolidayService";
import { createAppointmentHolidaySchema } from "@/validators/appointmentHoliday";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointment-holidays?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Danh sach ngay nghi/le/tam ngung tiep nhan (19.2.8/19.2.9) - chi can dang
 * nhap (khong yeu cau permission rieng), de cong dan cung xem duoc lich nghi
 * khi dat lich hen (giong GET /api/appointment-services).
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        const { searchParams } = new URL(req.url);
        const items = await listAppointmentHolidays({
            actorUser,
            from: searchParams.get("from") || undefined,
            to: searchParams.get("to") || undefined,
        });
        return apiSuccess(items);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.manage");
        const body = createAppointmentHolidaySchema.parse(await req.json());
        const holiday = await createAppointmentHoliday(actorUser, body);
        return apiSuccess(holiday, "Da khai bao ngay nghi/le", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
