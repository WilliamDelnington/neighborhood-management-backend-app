import mongoose, { Schema, type Document, type Model } from "mongoose";
import { BUSINESS_DOCUMENT_STATUS, type BusinessDocumentStatus } from "@/types";

export interface IBusinessDocument extends Document {
    businessId: mongoose.Types.ObjectId;
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
    // true = ban nop hien hanh cho cap (businessId, documentTypeId); khi chu ho
    // nop lai, ban cu duoc chuyen active=false (KHONG xoa) de giu lich su.
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const BusinessDocumentSchema = new Schema<IBusinessDocument>(
    {
        businessId: {
            type: Schema.Types.ObjectId,
            ref: "Business",
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

BusinessDocumentSchema.index({ businessId: 1, documentTypeId: 1, active: 1 });

export default (mongoose.models.BusinessDocument as Model<IBusinessDocument>) ||
    mongoose.model<IBusinessDocument>("BusinessDocument", BusinessDocumentSchema);
