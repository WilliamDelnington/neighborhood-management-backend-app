import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { Complaint, FileAsset } from "@/models";
import { deleteAttachment } from "@/services/attachmentService";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/complaints/:id/attachments/:fileId
 * Chi chu phan anh moi duoc xoa tai lieu dinh kem (khong co nhanh cho nhan
 * vien nhu House/Business - xem quyet dinh "owner only"). :id co the la mot
 * phan anh da ton tai, hoac mot draftId chua ung voi ban ghi nao (dang xoa
 * bot mot tai lieu vua dinh kem tren form tao, truoc khi bam "Gui") - truong
 * hop nay khong co Complaint de kiem tra chu so huu, nen xet truc tiep
 * FileAsset.uploadedBy.
 */
export async function DELETE(
    req: Request,
    { params }: { params: { id: string; fileId: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);

        const complaint = await Complaint.findById(params.id);
        if (complaint) {
            if (String(complaint.createdByUserId) !== String(user._id)) {
                throw new HttpError(
                    "Chỉ chủ phản ánh mới được xóa tài liệu đính kèm",
                    403,
                );
            }
        } else {
            const fileAsset = await FileAsset.findOne({
                _id: params.fileId,
                relatedModel: "Complaint",
                relatedId: params.id,
            });
            if (!fileAsset) throw new HttpError("Khong tim thay file dinh kem", 404);
            if (String(fileAsset.uploadedBy) !== String(user._id)) {
                throw new HttpError(
                    "Chỉ chủ phản ánh mới được xóa tài liệu đính kèm",
                    403,
                );
            }
        }

        await deleteAttachment(
            String(user._id),
            "Complaint",
            params.id,
            params.fileId,
        );
        return apiSuccess(null, "Xoa tai lieu dinh kem thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
