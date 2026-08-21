import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { changePhoneSchema } from "@/validators/auth";
import { changeOwnPhone } from "@/services/authService";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-phone
 * Doi so dien thoai dang nhap - xac thuc lai qua Zalo getPhoneNumber (xem
 * changeOwnPhone), khong con di qua PATCH /api/auth/me chung nua.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        const body = changePhoneSchema.parse(await req.json());
        const updated = await changeOwnPhone(String(user._id), body);
        return apiSuccess(updated, "Đã đổi số điện thoại thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
