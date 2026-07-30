import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IDocumentType extends Document {
    name: string;
    code: string;
    description?: string;
    hasIssueDate: boolean;
    hasExpiryDate: boolean;
    active: boolean;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const DocumentTypeSchema = new Schema<IDocumentType>(
    {
        name: { type: String, required: true, trim: true },
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        description: { type: String, trim: true },
        hasIssueDate: { type: Boolean, default: false },
        hasExpiryDate: { type: Boolean, default: false },
        active: { type: Boolean, default: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.DocumentType as Model<IDocumentType>) ||
    mongoose.model<IDocumentType>("DocumentType", DocumentTypeSchema);
