import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { resetPasswordForRequest } from "@/services/passwordResetRequestService";

export const dynamic = "force-dynamic";

// To truong/to pho/admin (users.reset_password) bam nut "Dat lai mat khau" -
// tu sinh mat khau ngau nhien va luu tam de CHINH CONG DAN tu lay qua
// /reveal. KHONG tra mat khau ve day (dù resetPasswordForRequest co tra ve) -
// nguoi xu ly yeu cau khong duoc biet mat khau moi cua nguoi khac, chi cong
// dan tu nhap lai so dien thoai o man dang nhap moi lay duoc (va chi lay
// duoc mot lan - xem revealPasswordResetRequest).
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "users.reset_password");
        const { request } = await resetPasswordForRequest(
            actorUser,
            params.id,
        );
        return apiSuccess({ request }, "Đã đặt lại mật khẩu mới");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
