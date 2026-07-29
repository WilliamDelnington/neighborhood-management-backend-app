import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { signUploadToken } from "@/lib/auth";
import { HouseRecord, Business } from "@/models";
import { assertHouseRecordInScope } from "@/services/houseRecordService";

export const dynamic = "force-dynamic";

const UPLOAD_TOKEN_TTL_SECONDS = 10 * 60;

const createUploadTokenSchema = z.object({
    relatedModel: z.enum(["HouseRecord", "Business"]),
    relatedId: z.string().min(1),
});

/**
 * POST /api/uploads/token
 * Cap mot token upload ngan han (10 phut), gan chet vao dung mot ban ghi
 * (relatedModel/relatedId) actor da duoc kiem tra quyen truy cap. Dung de
 * nhung vao query string cua serverUploadUrl truyen cho openMediaPicker (Zalo
 * Mini App) - xem UploadTokenPayload va route /api/uploads/attachments de
 * biet ly do can token rieng thay vi dung lai session JWT thong thuong.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);

        const body = createUploadTokenSchema.parse(await req.json());

        if (body.relatedModel === "HouseRecord") {
            await requireAnyPermission(user, ["houses.update", "houses.verify"]);
            const houseRecord = await HouseRecord.findById(body.relatedId);
            if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);
            assertHouseRecordInScope(user, houseRecord);
        } else {
            await requireAnyPermission(user, [
                "businesses.update",
                "businesses.verify",
            ]);
            const business = await Business.findById(body.relatedId);
            if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);
            const houseRecord = await HouseRecord.findById(business.houseId);
            if (!houseRecord) {
                throw new HttpError(
                    "Khong tim thay nha so cua ho kinh doanh nay",
                    404,
                );
            }
            assertHouseRecordInScope(user, houseRecord);
        }

        const token = signUploadToken({
            purpose: "upload",
            userId: String(user._id),
            relatedModel: body.relatedModel,
            relatedId: body.relatedId,
        });

        return apiSuccess({ token, expiresInSeconds: UPLOAD_TOKEN_TTL_SECONDS });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
