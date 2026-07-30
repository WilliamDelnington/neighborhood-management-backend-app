import mongoose, { Schema, type Document, type Model } from "mongoose";

// Mot dong luat: loai giay to nao la bat buoc/tuy chon cho loai hinh kinh
// doanh nay, canh bao truoc het han bao nhieu ngay (neu giay to co han), va
// vai tro nao duoc phep duyet loai giay to do. reviewerRoles rong = fallback
// ve permission "businesses.verify" (xem businessDocumentService).
export interface IBusinessTypeDocumentRule {
    _id: mongoose.Types.ObjectId;
    documentTypeId: mongoose.Types.ObjectId;
    isRequired: boolean;
    warningBeforeDays?: number;
    reviewerRoles: string[];
}

export interface IBusinessType extends Document {
    name: string;
    description?: string;
    active: boolean;
    sortOrder: number;
    requiredDocuments: IBusinessTypeDocumentRule[];
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const BusinessTypeDocumentRuleSchema = new Schema<IBusinessTypeDocumentRule>({
    documentTypeId: {
        type: Schema.Types.ObjectId,
        ref: "DocumentType",
        required: true,
    },
    isRequired: { type: Boolean, default: true },
    warningBeforeDays: { type: Number },
    reviewerRoles: { type: [String], default: [] },
});

const BusinessTypeSchema = new Schema<IBusinessType>(
    {
        name: { type: String, required: true, unique: true, trim: true },
        description: { type: String, trim: true },
        active: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0 },
        requiredDocuments: {
            type: [BusinessTypeDocumentRuleSchema],
            default: [],
        },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

BusinessTypeSchema.index({ active: 1, sortOrder: 1, name: 1 });

export default (mongoose.models.BusinessType as Model<IBusinessType>) ||
    mongoose.model<IBusinessType>("BusinessType", BusinessTypeSchema);
