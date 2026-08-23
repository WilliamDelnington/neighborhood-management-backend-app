import mongoose, { Schema } from "mongoose";

// Mot dong luat: loai giay to nao la bat buoc/tuy chon cho MOT ban ghi cu the
// (House/Household/Company - khac Business, noi dong luat nam tren BusinessType
// dung chung cho nhieu Business). canh bao truoc het han bao nhieu ngay (neu
// giay to co han), va vai tro nao duoc phep duyet loai giay to do. reviewerRoles
// rong = fallback ve permission ".verify" tuong ung cua tung loai ban ghi (xem
// services/requiredDocumentService.ts).
export interface IRequiredDocumentRule {
    _id: mongoose.Types.ObjectId;
    documentTypeId: mongoose.Types.ObjectId;
    isRequired: boolean;
    warningBeforeDays?: number;
    reviewerRoles: string[];
}

export const RequiredDocumentRuleSchema = new Schema<IRequiredDocumentRule>({
    documentTypeId: {
        type: Schema.Types.ObjectId,
        ref: "DocumentType",
        required: true,
    },
    isRequired: { type: Boolean, default: true },
    warningBeforeDays: { type: Number },
    reviewerRoles: { type: [String], default: [] },
});
