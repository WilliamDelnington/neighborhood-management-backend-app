import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { cleanupExpiredComplaintDrafts } from "@/services/maintenanceService";

export const dynamic = "force-dynamic";

/**
 * POST /api/maintenance/cleanup-complaint-drafts
 * Don cac tai lieu dinh kem "mo coi" cua phan anh (nguoi dung dinh kem tren
 * form tao roi bo ngang, khong bao gio gui - xem cleanupExpiredComplaintDrafts).
 * Chi admin duoc goi truc tiep hien tai; chua co ha tang cron trong repo nay,
 * nen viec lich chay dinh ky (Vercel Cron/OS cron...) la buoc trien khai rieng.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        requireRole(user, "admin");

        const deletedCount = await cleanupExpiredComplaintDrafts();
        return apiSuccess({ deletedCount });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
