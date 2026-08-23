import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    RequiredDocumentRuleSchema,
    type IRequiredDocumentRule,
} from "./RequiredDocumentRule";

export const REQUIRED_DOCUMENT_SETTINGS_CATEGORIES = [
    "house",
    "household",
    "company",
] as const;
export type RequiredDocumentSettingsCategory =
    (typeof REQUIRED_DOCUMENT_SETTINGS_CATEGORIES)[number];

/**
 * Dong luat "giay to bat buoc/tuy chon" AP DUNG CHUNG cho toan bo mot loai
 * ban ghi (tat ca House, hoac tat ca Household, hoac tat ca Company) - KHONG
 * khai bao rieng tren tung ban ghi (khac thiet ke ban dau, doi lai theo yeu
 * cau vi luu tren tung ban ghi ton nhieu thoi gian/dung luong DB khong can
 * thiet khi cac ban ghi cung loai thuong yeu cau giong nhau). Moi category
 * chi co DUNG MOT ban ghi settings (unique index), upsert qua
 * requiredDocumentService.putRequiredDocuments.
 */
export interface IRequiredDocumentSettings extends Document {
    category: RequiredDocumentSettingsCategory;
    requiredDocuments: IRequiredDocumentRule[];
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const RequiredDocumentSettingsSchema = new Schema<IRequiredDocumentSettings>(
    {
        category: {
            type: String,
            enum: REQUIRED_DOCUMENT_SETTINGS_CATEGORIES,
            required: true,
            unique: true,
        },
        requiredDocuments: {
            type: [RequiredDocumentRuleSchema],
            default: [],
        },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.RequiredDocumentSettings as Model<IRequiredDocumentSettings>) ||
    mongoose.model<IRequiredDocumentSettings>(
        "RequiredDocumentSettings",
        RequiredDocumentSettingsSchema,
    );
