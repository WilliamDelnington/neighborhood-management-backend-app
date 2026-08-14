import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    listAppointmentServices,
    createAppointmentService,
} from "@/services/appointmentServiceService";
import { createAppointmentServiceSchema } from "@/validators/appointmentService";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointment-services?activeOnly=true
 * Danh sach dich vu dat lich hen - chi can dang nhap (khong yeu cau permission
 * rieng), de cong dan cung xem duoc khi chon dich vu de dat lich.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        await requireUser(req);
        const { searchParams } = new URL(req.url);
        const items = await listAppointmentServices({
            activeOnly: searchParams.get("activeOnly") === "true",
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
        const body = createAppointmentServiceSchema.parse(await req.json());
        const service = await createAppointmentService(actorUser, body);
        return apiSuccess(service, "Tao dich vu dat lich hen thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
