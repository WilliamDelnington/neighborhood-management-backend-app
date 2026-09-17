import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { resetPasswordForRequest } from "@/services/passwordResetRequestService";

export const dynamic = "force-dynamic";

// To truong/to pho/admin (users.reset_password) bam nut "Dat lai mat khau" -
// tu sinh mat khau ngau nhien va luu tam de cong dan tu lay qua /reveal. Tra
// ve ca mat khau cho nhan vien (de ho co the bao mieng/goi dien them, chua co
// SMS/Zalo OA - xem notification_channels), khac voi danh sach
// (listPasswordResetRequests) khong bao gio lo mat khau nay.
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.reset_password");
        const { request, plainPassword } = await resetPasswordForRequest(
            actorUser,
            params.id,
        );
        return apiSuccess(
            { request, plainPassword },
            "Đã đặt lại mật khẩu mới",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
