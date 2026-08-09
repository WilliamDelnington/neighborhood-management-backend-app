import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { isValidVnPhone } from "@/lib/phone";
import { checkOwnerPhoneExists } from "@/services/houseRecordService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        // Cung permission voi form tao nha so (khong dung "users.read" - xem
        // ghi chu o checkOwnerPhoneExists).
        await requirePermission(user, "houses.create");

        const { searchParams } = new URL(req.url);
        const phone = searchParams.get("phone") || "";
        if (!isValidVnPhone(phone)) {
            throw new HttpError("So dien thoai khong hop le", 422);
        }

        const result = await checkOwnerPhoneExists(phone);
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
