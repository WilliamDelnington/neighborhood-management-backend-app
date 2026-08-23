import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createAppointment, listAppointments } from "@/services/appointmentService";
import { createAppointmentSchema } from "@/validators/appointment";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.create");
        const body = createAppointmentSchema.parse(await req.json());
        const appointment = await createAppointment(actorUser, body);
        return apiSuccess(appointment, "Đặt lịch hẹn thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "appointments.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listAppointments({
            actorUser,
            status: searchParams.get("status") || undefined,
            serviceId: searchParams.get("serviceId") || undefined,
            date: searchParams.get("date") || undefined,
            page,
            limit,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
