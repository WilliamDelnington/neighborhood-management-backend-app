import mongoose, { Schema, type Document, type Model } from "mongoose";
import { TRANG_THAI_PHAN_ANH, type TrangThaiPhanAnh } from "@/types";

export interface IComplaint extends Document {
    code: string;
    // Truoc la NhomPhanAnh (enum tinh, xem NHOM_PHAN_ANH trong @/types) - nay
    // la key cua ComplaintTypeDefinition (danh muc quan tri duoc, xem
    // complaintTypeDefinitionService.ts). Khong con gioi han bang mongoose
    // enum (xem schema ben duoi) - gia tri thuc te duoc kiem tra o service
    // layer (assertValidComplaintCategory trong complaintService.ts), van
    // chap nhan cac gia tri NHOM_PHAN_ANH cu lam fallback trong giai doan
    // migrate truoc khi chay scripts/seed-complaint-types.ts.
    category: string;
    title: string;
    content: string;
    area?: string;
    status: TrangThaiPhanAnh;
    cluster?: string;
    neighborhoodId?: mongoose.Types.ObjectId;
    wardCode?: number;
    // Nha so nguoi gui CHU DONG chon de gan phan anh vao - khong bat buoc, va
    // KHONG can la nha cua chinh nguoi gui (vd bao phan anh ve nha hang xom).
    // Neu co, uu tien dung neighborhoodId/cluster cua chinh nha nay thay vi
    // suy tu ho khau/nha cua nguoi gui - xem createComplaint.
    targetHouseId?: mongoose.Types.ObjectId;
    createdByUserId: mongoose.Types.ObjectId;
    assigneeId?: mongoose.Types.ObjectId;
    secondaryAssigneeIds: mongoose.Types.ObjectId[];
    expectedCompletionDate?: Date;
    actualCompletionDate?: Date;
    escalatedToCommittee: boolean;
    internalNotes?: string;
    // Chi dat khi category="ha_tang" va nguoi gui chon lien ket toi mot tai
    // san cu the trong so ha tang (B11.03) - tuy chon, khong bat buoc.
    relatedAssetId?: mongoose.Types.ObjectId;
    // Danh gia cua nguoi gui khi xac nhan hoan thanh (1-5 sao), tuy chon -
    // xem confirmComplaintResolution. Khong the sua lai sau khi da danh gia
    // (status da chuyen sang "hoan_thanh", khong con hanh dong nao ghi de).
    rating?: number;
    ratingNote?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ComplaintSchema = new Schema<IComplaint>(
    {
        code: { type: String, required: true, unique: true, index: true },
        category: { type: String, required: true, trim: true },
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
        area: { type: String },
        status: {
            type: String,
            enum: TRANG_THAI_PHAN_ANH,
            default: "moi_tiep_nhan",
            index: true,
        },
        // Denormalized tu cluster cua nguoi tao tai thoi diem gui phan anh, dung
        // de loc theo pham vi phu trach (clusterScopeFilter). Khong bat buoc va
        // khong nhan tu client - xem resolveComplaintCluster trong complaintService.
        cluster: { type: String, index: true },
        // Denormalized tuong tu cluster, suy tu Household.neighborhoodId/
        // User.neighborhoodId cua nguoi tao tai thoi diem gui phan anh - dung
        // de loc theo to dan pho cho neighborhood_leader (areaScopeFilter).
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        // Denormalized tai thoi diem gui phan anh: wardCode cua Neighborhood da
        // resolve, hoac User.wardCode cua nguoi tao (nhan vien), hoac cuoi cung
        // la setting "default_ward_code" khi khong resolve duoc gi ca - dam bao
        // phan anh khong bao gio "mat tich" chi vi khong xac dinh duoc to dan
        // pho, ke ca khi ung dung mo rong nhieu phuong sau nay - xem
        // resolveComplaintWardCode trong complaintService.ts.
        wardCode: { type: Number, index: true },
        targetHouseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            index: true,
        },
        createdByUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
        secondaryAssigneeIds: {
            type: [{ type: Schema.Types.ObjectId, ref: "User" }],
            default: [],
        },
        expectedCompletionDate: { type: Date },
        actualCompletionDate: { type: Date },
        escalatedToCommittee: { type: Boolean, default: false },
        internalNotes: { type: String },
        relatedAssetId: {
            type: Schema.Types.ObjectId,
            ref: "InfrastructureAsset",
        },
        rating: { type: Number, min: 1, max: 5 },
        ratingNote: { type: String, trim: true },
    },
    { timestamps: true },
);

ComplaintSchema.index({ title: "text", content: "text" });
ComplaintSchema.index({ category: 1, status: 1, createdAt: -1 });

export default (mongoose.models.Complaint as Model<IComplaint>) ||
    mongoose.model<IComplaint>("Complaint", ComplaintSchema);
