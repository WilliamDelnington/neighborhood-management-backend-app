import mongoose, { Schema, type Document, type Model } from "mongoose";
import { VERIFICATION_STATUS, type VerificationStatus } from "@/types";

export interface IBusiness extends Document {
    name: string;
    houseId: mongoose.Types.ObjectId;
    cluster: string;
    streetId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    businessType?: mongoose.Types.ObjectId;
    ownerName?: string;
    phone?: string;
    active: boolean;
    // Trang thai xac thuc CUA CHINH ho kinh doanh nay - doc lap voi trang thai
    // cua nha so cha (xem VerificationStatus o types/index.ts). "pending"/
    // "verified"/"denied" duoc tinh tu dong tu ket qua duyet tung giay to bat
    // buoc (xem businessDocumentService.recomputeBusinessStatus); "unverified"
    // luc moi tao; "locked" chi admin gan duoc.
    status: VerificationStatus;
    approvalNote?: string;
    denialReason?: string;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const BusinessSchema = new Schema<IBusiness>(
    {
        name: { type: String, required: true, trim: true },
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        cluster: { type: String, required: true, index: true },
        // Chuan hoa cua `cluster` (xem src/lib/streetSync.ts), sao chep tu
        // HouseRecord lien ket luc tao, giong cluster.
        streetId: { type: Schema.Types.ObjectId, ref: "Street", index: true },
        // Sao chep tu HouseRecord.neighborhoodId lien ket luc tao, giong cluster
        // - HouseRecord.neighborhoodId duoc admin gan thu cong nen co the con
        // trong voi nha chua duoc gan.
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        businessType: { type: Schema.Types.ObjectId, ref: "BusinessType" },
        ownerName: { type: String, trim: true },
        phone: { type: String, trim: true },
        active: { type: Boolean, default: true },
        status: {
            type: String,
            enum: VERIFICATION_STATUS,
            default: "unverified",
            index: true,
        },
        approvalNote: { type: String },
        denialReason: { type: String },
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

BusinessSchema.index({ name: "text" });

export default (mongoose.models.Business as Model<IBusiness>) ||
    mongoose.model<IBusiness>("Business", BusinessSchema);
