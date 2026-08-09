import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import {
    requireUser,
    requireAnyPermission,
    requirePermission,
} from "@/lib/rbac";
import { signUploadToken } from "@/lib/auth";
import { HouseRecord, Business, Complaint } from "@/models";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { isHouseOwnerActor } from "@/services/houseOwnershipService";

export const dynamic = "force-dynamic";

const UPLOAD_TOKEN_TTL_SECONDS = 10 * 60;

const createUploadTokenSchema = z.object({
    relatedModel: z.enum([
        "HouseRecord",
        "Business",
        "BusinessDocument",
        "Complaint",
    ]),
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
            await assertHouseRecordInScope(user, houseRecord);
        } else if (body.relatedModel === "Business") {
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
            await assertHouseRecordInScope(user, houseRecord);
        } else if (body.relatedModel === "Complaint") {
            // Chi chu phan anh moi duoc dinh kem tai lieu (xem quyet dinh
            // "owner only" trong ke hoach) - khong co nhanh cho staff nhu
            // House/Business. relatedId co the la mot phan anh da ton tai
            // (chu phan anh dinh kem them tu trang chi tiet) hoac mot draftId
            // chua ung voi ban ghi nao (nguoi dung dang dinh kem file ngay
            // tren form tao moi, truoc khi bam "Gui"). Voi truong hop draft,
            // khong co ban ghi nao de kiem tra chu so huu - ban than viec cap
            // duoc token (sau khi da qua requirePermission ben tren) da la du
            // dieu kien, vi chua ai khac co the da so huu mot id chua ton tai.
            await requirePermission(user, "complaints.create");
            const complaint = await Complaint.findById(body.relatedId);
            if (
                complaint &&
                String(complaint.createdByUserId) !== String(user._id)
            ) {
                throw new HttpError(
                    "Chỉ chủ phản ánh mới được đính kèm tài liệu",
                    403,
                );
            }
        } else {
            // BusinessDocument: chi chu ho kinh doanh (hoac admin) duoc tai
            // len giay to - khac voi nhanh "Business" o tren (nhan vien co
            // businesses.update/.verify cung xin duoc token), vi giay to xac
            // thuc chi do chinh chu ho nop (xem businessDocumentService).
            const business = await Business.findById(body.relatedId);
            if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);
            const houseRecord = await HouseRecord.findById(business.houseId);
            if (!houseRecord) {
                throw new HttpError(
                    "Khong tim thay nha so cua ho kinh doanh nay",
                    404,
                );
            }
            const isAdmin = user.roles.includes("admin");
            const isOwner = await isHouseOwnerActor(houseRecord._id, user._id);
            if (!isAdmin && !isOwner) {
                throw new HttpError(
                    "Chỉ chủ hộ kinh doanh mới được tải lên giấy tờ",
                    403,
                );
            }
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
