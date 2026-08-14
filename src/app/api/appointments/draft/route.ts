import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/appointments/draft
 * Mirror POST /api/complaints/draft: cap mot id moi (chua ung voi ban ghi
 * Appointment nao) de client dung ngay tren form dat lich - dinh kem tai lieu
 * truoc (qua /api/uploads/token voi relatedModel="Appointment", relatedId=
 * draftId nay) roi moi goi POST /api/appointments voi draftId nay -
 * appointmentService.createAppointment se dung draftId lam _id cua Appointment
 * moi, nen cac FileAsset da dinh kem tu truoc tu dong thuoc ve lich hen vua
 * tao. Khong ghi DB - chi la mot ObjectId moi.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "appointments.create");

        return apiSuccess({ draftId: new mongoose.Types.ObjectId().toString() });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
