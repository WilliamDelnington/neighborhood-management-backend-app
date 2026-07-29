import { FileAsset, type IFileAsset } from "@/models";
import { HttpError } from "@/lib/response";
import { deleteUploadedFile } from "@/lib/localUpload";
import { writeAuditLog } from "@/services/auditService";

/**
 * Danh sach/xoa file dinh kem dung chung theo mau relatedModel/relatedId cua
 * FileAsset (cung mau da dung rieng cho PcccCheck trong pcccService.ts -
 * xem listPcccAttachments/deletePcccAttachment. Khong sua lai PCCC de tranh
 * dong cham khong lien quan; ham nay dung cho HouseRecord va Business, dua
 * qua src/app/api/houses/[id]/attachments va businesses/[id]/attachments).
 * Viec tao file dinh kem (upload) nam rieng trong route /api/uploads/attachments
 * (xem uploadRelatedAttachment) vi phai tra ve dung "khung" JSON ma
 * openMediaPicker cua Zalo yeu cau, khac voi apiSuccess thong thuong.
 */
export async function listAttachments(
    relatedModel: string,
    relatedId: string,
): Promise<IFileAsset[]> {
    return FileAsset.find({ relatedModel, relatedId })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName");
}

export async function deleteAttachment(
    actorId: string,
    relatedModel: string,
    relatedId: string,
    fileAssetId: string,
): Promise<void> {
    const fileAsset = await FileAsset.findOne({
        _id: fileAssetId,
        relatedModel,
        relatedId,
    });
    if (!fileAsset) throw new HttpError("Khong tim thay file dinh kem", 404);

    await deleteUploadedFile(fileAsset.url);
    await fileAsset.deleteOne();

    await writeAuditLog({
        actorId,
        action: "attachment.delete",
        targetModel: relatedModel,
        targetId: relatedId,
        metadata: { fileAssetId, name: fileAsset.name },
    });
}
