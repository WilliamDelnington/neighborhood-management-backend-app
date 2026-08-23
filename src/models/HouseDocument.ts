import mongoose, { Schema, type Document, type Model } from "mongoose";
import { BUSINESS_DOCUMENT_STATUS, type BusinessDocumentStatus } from "@/types";

export interface IHouseDocument extends Document {
    houseId: mongoose.Types.ObjectId;
    documentTypeId: mongoose.Types.ObjectId;
    fileAssetId: mongoose.Types.ObjectId;
    docNumber?: string;
    issueDate?: Date;
    expiryDate?: Date;
    status: BusinessDocumentStatus;
    rejectionReason?: string;
    approvalNote?: string;
    uploadedBy: mongoose.Types.ObjectId;
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedAt?: Date;
    // true = ban nop hien hanh cho cap (houseId, documentTypeId); khi chu nha
    // nop lai, ban cu duoc chuyen active=false (KHONG xoa) de giu lich su -
    // giong BusinessDocument.
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const HouseDocumentSchema = new Schema<IHouseDocument>(
    {
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        documentTypeId: {
            type: Schema.Types.ObjectId,
            ref: "DocumentType",
            required: true,
            index: true,
        },
        fileAssetId: {
            type: Schema.Types.ObjectId,
            ref: "FileAsset",
            required: true,
        },
        docNumber: { type: String, trim: true },
        issueDate: { type: Date },
        expiryDate: { type: Date },
        status: {
            type: String,
            enum: BUSINESS_DOCUMENT_STATUS,
            default: "pending",
            index: true,
        },
        rejectionReason: { type: String, trim: true },
        approvalNote: { type: String, trim: true },
        uploadedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
        reviewedAt: { type: Date },
        active: { type: Boolean, default: true, index: true },
    },
    { timestamps: true },
);

HouseDocumentSchema.index({ houseId: 1, documentTypeId: 1, active: 1 });

export default (mongoose.models.HouseDocument as Model<IHouseDocument>) ||
    mongoose.model<IHouseDocument>("HouseDocument", HouseDocumentSchema);
