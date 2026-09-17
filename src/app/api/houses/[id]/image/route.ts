import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    getHouseRecordById,
    assertHouseRecordInScope,
    uploadHouseImage,
} from "@/services/houseRecordService";

export const dynamic = "force-dynamic";

/**
 * POST /api/houses/:id/image
 * Tai len/thay anh dai dien cua Nha so - cung quyen+pham vi voi PATCH
 * /api/houses/:id (houses.update + assertHouseRecordInScope) nen chu nha tu
 * doi anh nha minh duoc, khong chi staff/admin.
 */
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "houses.update");

        const existing = await getHouseRecordById(params.id);
        await assertHouseRecordInScope(actorUser, existing);

        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            throw new HttpError("Thiếu file cần tải lên", 400);
        }

        const houseRecord = await uploadHouseImage(
            String(actorUser._id),
            params.id,
            file,
        );
        return apiSuccess(houseRecord, "Tải lên ảnh nhà số thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
