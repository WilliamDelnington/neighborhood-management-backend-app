import { Complaint, FileAsset } from "@/models";
import { deleteUploadedFile } from "@/lib/localUpload";
import { writeAuditLog } from "@/services/auditService";

const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Xoa cac FileAsset dinh kem vao mot draftId phan anh (xem
 * POST /api/complaints/draft) ma nguoi dung da dinh kem tren form tao roi bo
 * ngang, khong bao gio bam "Gui" - nen khong co ban ghi Complaint nao ung voi
 * relatedId cua chung. Chi xoa nhung ban ghi da qua DRAFT_EXPIRY_MS de tranh
 * xoa nham tai lieu cua mot phan anh dang duoc tao dung luc chay job nay.
 */
export async function cleanupExpiredComplaintDrafts(): Promise<number> {
    const cutoff = new Date(Date.now() - DRAFT_EXPIRY_MS);
    const candidates = await FileAsset.find({
        relatedModel: "Complaint",
        createdAt: { $lt: cutoff },
    });

    let deletedCount = 0;
    for (const fileAsset of candidates) {
        const complaint = await Complaint.findById(fileAsset.relatedId);
        if (complaint) continue;

        await deleteUploadedFile(fileAsset.url);
        await fileAsset.deleteOne();
        deletedCount += 1;
    }

    if (deletedCount > 0) {
        await writeAuditLog({
            action: "complaint.draft_attachments_cleanup",
            targetModel: "FileAsset",
            metadata: { deletedCount },
        });
    }

    return deletedCount;
}
