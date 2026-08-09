import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/complaints/draft
 * Cap mot id moi (chua ung voi ban ghi Complaint nao) de client dung ngay tren
 * form tao phan anh: dinh kem tai lieu truoc (qua /api/uploads/token voi
 * relatedModel="Complaint", relatedId=draftId nay) roi moi gui phan anh voi
 * draftId nay - complaintService.createComplaint se dung draftId lam _id cua
 * ban ghi Complaint moi, nen cac FileAsset da dinh kem tu truoc tu dong thuoc
 * ve phan anh vua tao, khong can buoc "gan lai" nao ca. Khong ghi DB - chi la
 * mot ObjectId moi, tinh doc nhat da duoc mongoose/MongoDB dam bao.
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "complaints.create");

        return apiSuccess({ draftId: new mongoose.Types.ObjectId().toString() });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
