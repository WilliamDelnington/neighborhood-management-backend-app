import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { Role } from "@/types";

export interface IFileAsset extends Document {
    name: string;
    description?: string;
    url: string;
    mimeType?: string;
    sizeBytes?: number;
    category: "form" | "attachment" | "minutes" | "other";
    relatedModel?: string;
    relatedId?: mongoose.Types.ObjectId;
    isPublic: boolean;
    // audienceAll=true (mac dinh): moi vai tro deu xem duoc (giu nguyen hanh vi cu).
    // audienceAll=false: chi user co it nhat 1 role nam trong targetRoles moi xem duoc.
    targetRoles: Role[];
    audienceAll: boolean;
    uploadedBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const FileAssetSchema = new Schema<IFileAsset>(
    {
        name: { type: String, required: true },
        description: { type: String },
        url: { type: String, required: true },
        mimeType: { type: String },
        sizeBytes: { type: Number },
        category: {
            type: String,
            enum: ["form", "attachment", "minutes", "other"],
            default: "other",
        },
        relatedModel: { type: String },
        relatedId: { type: Schema.Types.ObjectId },
        isPublic: { type: Boolean, default: false },
        targetRoles: { type: [String], default: [] },
        audienceAll: { type: Boolean, default: true },
        uploadedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true },
);

export default (mongoose.models.FileAsset as Model<IFileAsset>) ||
    mongoose.model<IFileAsset>("FileAsset", FileAssetSchema);
