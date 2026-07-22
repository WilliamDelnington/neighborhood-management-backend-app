import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { updateHouseRecordStatusSchema } from "@/validators/houseRecord";
import { transitionHouseRecordStatus } from "@/services/houseRecordService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/houses/:id/status
 * Chuyen trang thai xac thuc cua nha so (gui duyet / duyet / tu choi / khoa).
 * Kiem tra quyen chi tiet (chu nha vs nhan vien xac thuc vs admin) nam trong
 * transitionHouseStatus - o day chi loc tho: phai co it nhat mot trong hai
 * quyen lien quan, tranh regional_police (khong co ca hai) goi duoc endpoint nay.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, ["houses.update", "houses.verify"]);

        const body = updateHouseRecordStatusSchema.parse(await req.json());
        const houseRecord = await transitionHouseRecordStatus(
            user,
            params.id,
            body.status,
        );
        return apiSuccess(houseRecord, "Cap nhat trang thai nha so thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
