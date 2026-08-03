import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    NHOM_PHAN_ANH,
    TRANG_THAI_PHAN_ANH,
    type NhomPhanAnh,
    type TrangThaiPhanAnh,
} from "@/types";

export interface IComplaint extends Document {
    code: string;
    category: NhomPhanAnh;
    title: string;
    content: string;
    area?: string;
    images: string[];
    status: TrangThaiPhanAnh;
    cluster?: string;
    neighborhoodId?: mongoose.Types.ObjectId;
    createdByUserId: mongoose.Types.ObjectId;
    assigneeId?: mongoose.Types.ObjectId;
    expectedCompletionDate?: Date;
    actualCompletionDate?: Date;
    escalatedToCommittee: boolean;
    internalNotes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ComplaintSchema = new Schema<IComplaint>(
    {
        code: { type: String, required: true, unique: true, index: true },
        category: { type: String, enum: NHOM_PHAN_ANH, required: true },
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
        area: { type: String },
        images: { type: [String], default: [] },
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
        createdByUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
        expectedCompletionDate: { type: Date },
        actualCompletionDate: { type: Date },
        escalatedToCommittee: { type: Boolean, default: false },
        internalNotes: { type: String },
    },
    { timestamps: true },
);

ComplaintSchema.index({ title: "text", content: "text" });
ComplaintSchema.index({ category: 1, status: 1, createdAt: -1 });

export default (mongoose.models.Complaint as Model<IComplaint>) ||
    mongoose.model<IComplaint>("Complaint", ComplaintSchema);
