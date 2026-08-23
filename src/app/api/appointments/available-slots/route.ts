import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { getAvailableSlots } from "@/services/appointmentService";

export const dynamic = "force-dynamic";

/**
 * GET /api/appointments/available-slots?serviceId=&date=YYYY-MM-DD
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        await requireUser(req);
        const { searchParams } = new URL(req.url);
        const serviceId = searchParams.get("serviceId");
        const date = searchParams.get("date");
        if (!serviceId || !date) {
            throw new HttpError("Thieu serviceId hoac date", 422);
        }
        const slots = await getAvailableSlots(serviceId, date);
        return apiSuccess(slots);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
