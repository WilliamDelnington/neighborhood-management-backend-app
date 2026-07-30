import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { HttpError } from "@/lib/response";
import { getBearerToken, verifyUploadToken } from "@/lib/auth";
import { HouseRecord, Business, FileAsset, User } from "@/models";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { saveUploadedFile } from "@/lib/localUpload";
import { writeAuditLog } from "@/services/auditService";

export const dynamic = "force-dynamic";

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf",
    ".doc",
    ".docx",
];

/**
 * Server nay duoc goi TRUC TIEP boi client Zalo (tham so serverUploadUrl cua
 * openMediaPicker), KHONG qua request() thong thuong cua app - xem
 * /api/uploads/token/route.ts va tai lieu Zalo (docs.zaloplatforms.com/docs/MA/api/media/file/openMediaPicker):
 * client POST multipart/form-data (fieldname=file) va doc ket qua theo dung
 * khung { error: 0|khac 0, message, data } - KHONG phai khung apiSuccess/
 * apiError thong thuong cua app nay. Vi tai lieu Zalo khong xac nhan header
 * Authorization co duoc giu lai qua buoc POST nay hay khong, token duoc doc
 * uu tien tu query string (`?token=`) - luon duoc giu nguyen vi la mot phan
 * cua URL - voi header lam phuong an du phong khi tu goi thu de kiem tra.
 */
function zaloError(message: string): NextResponse {
    return NextResponse.json({ error: -1, message });
}

function getUploadToken(req: Request): string | null {
    const { searchParams } = new URL(req.url);
    return searchParams.get("token") || getBearerToken(req);
}

export async function POST(req: Request) {
    try {
        await connectDB();

        const rawToken = getUploadToken(req);
        if (!rawToken) return zaloError("Thieu token tai len");

        const payload = verifyUploadToken(rawToken);
        if (!payload) return zaloError("Token tai len khong hop le hoac da het han");

        const actorUser = await User.findById(payload.userId);
        if (!actorUser || actorUser.status === "locked") {
            return zaloError("Tai khoan khong hop le hoac da bi khoa");
        }

        // Kiem tra lai quyen tai thoi diem upload (khong chi tin token da cap
        // truoc do) - de phong truong hop pham vi cua actor thay doi giua luc
        // cap token va luc upload thuc su (vd nha da doi chu, actor bi thu
        // hoi quyen).
        let subDir: string;
        if (payload.relatedModel === "HouseRecord") {
            const houseRecord = await HouseRecord.findById(payload.relatedId);
            if (!houseRecord) return zaloError("Khong tim thay nha so");
            assertHouseRecordInScope(actorUser, houseRecord);
            subDir = `houses/${payload.relatedId}`;
        } else if (payload.relatedModel === "Business") {
            const business = await Business.findById(payload.relatedId);
            if (!business) return zaloError("Khong tim thay ho kinh doanh");
            const houseRecord = await HouseRecord.findById(business.houseId);
            if (!houseRecord) {
                return zaloError("Khong tim thay nha so cua ho kinh doanh nay");
            }
            assertHouseRecordInScope(actorUser, houseRecord);
            subDir = `businesses/${payload.relatedId}`;
        } else {
            // BusinessDocument: chi chu ho (hoac admin) - kiem tra lai giong
            // het luc cap token (xem /api/uploads/token/route.ts) vi pham vi
            // co the da thay doi giua luc cap token va luc upload thuc su.
            const business = await Business.findById(payload.relatedId);
            if (!business) return zaloError("Khong tim thay ho kinh doanh");
            const houseRecord = await HouseRecord.findById(business.houseId);
            if (!houseRecord) {
                return zaloError("Khong tim thay nha so cua ho kinh doanh nay");
            }
            const isAdmin = actorUser.roles.includes("admin");
            const isOwner =
                !!houseRecord.ownerId &&
                String(houseRecord.ownerId) === String(actorUser._id);
            if (!isAdmin && !isOwner) {
                return zaloError("Chi chu ho kinh doanh moi duoc tai len giay to");
            }
            subDir = `business-documents/${payload.relatedId}`;
        }

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
            return zaloError("Vui long chon file de tai len");
        }
        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
            return zaloError("File vuot qua dung luong cho phep (toi da 10MB)");
        }
        const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
            return zaloError(
                `Dinh dang file khong duoc ho tro (chi chap nhan ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")})`,
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const { url } = await saveUploadedFile(buffer, file.name, subDir);
        const absoluteUrl = new URL(url, new URL(req.url).origin).toString();

        const fileAsset = await FileAsset.create({
            name: file.name,
            url,
            mimeType: file.type || undefined,
            sizeBytes: file.size,
            category: "attachment",
            relatedModel: payload.relatedModel,
            relatedId: payload.relatedId,
            isPublic: false,
            audienceAll: false,
            targetRoles: [],
            uploadedBy: payload.userId,
        });

        await writeAuditLog({
            actorId: payload.userId,
            action: "attachment.upload",
            targetModel: payload.relatedModel,
            targetId: payload.relatedId,
            metadata: { fileAssetId: fileAsset._id, name: file.name },
        });

        return NextResponse.json({
            error: 0,
            message: "Success",
            // fileAssetIds: them ngoai khung {error,message,data:{urls}} bat
            // buoc cua Zalo openMediaPicker - client Zalo chi doc `urls`, nen
            // them truong nay khong pha vo hop dong cu. Can thiet de client
            // biet fileAssetId vua tao, dung goi tiep POST
            // /api/businesses/:id/documents (xem businessDocumentService).
            data: { urls: [absoluteUrl], fileAssetIds: [String(fileAsset._id)] },
        });
    } catch (err) {
        if (err instanceof HttpError) return zaloError(err.message);
        console.error(err);
        return zaloError("Da xay ra loi he thong khi tai file len");
    }
}
