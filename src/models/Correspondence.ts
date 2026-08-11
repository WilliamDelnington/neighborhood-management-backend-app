import mongoose, { Schema, type Document, type Model } from "mongoose";

// Van ban (Cong van/Bao cao/De xuat/Kien nghi...) - generic hoa tu OfficialDocument
// ban dau (chi mot chieu PCO/secretary -> neighborhood_leader). Chieu gui/nhan
// hop le khong con hardcode o day - do CorrespondenceType.allowedSenderRoles/
// allowedReceiverRoles quyet dinh, xem correspondenceService.ts.
export const CORRESPONDENCE_STATUS = ["nhap", "da_gui"] as const;
export type CorrespondenceStatus = typeof CORRESPONDENCE_STATUS[number];

export interface ICorrespondence extends Document {
    correspondenceTypeId: mongoose.Types.ObjectId;
    documentNumber?: string;
    title: string;
    content: string;
    issuedAt: Date;
    status: CorrespondenceStatus;
    isUrgent: boolean;
    senderId: mongoose.Types.ObjectId;
    targetNeighborhoodIds: mongoose.Types.ObjectId[];
    targetUserIds: mongoose.Types.ObjectId[];
    sentAt?: Date;
    createdBy: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CorrespondenceSchema = new Schema<ICorrespondence>(
    {
        correspondenceTypeId: {
            type: Schema.Types.ObjectId,
            ref: "CorrespondenceType",
            required: true,
            index: true,
        },
        documentNumber: { type: String, trim: true },
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
        issuedAt: { type: Date, required: true },
        status: {
            type: String,
            enum: CORRESPONDENCE_STATUS,
            default: "nhap",
            index: true,
        },
        isUrgent: { type: Boolean, default: false },
        senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        targetNeighborhoodIds: {
            type: [Schema.Types.ObjectId],
            ref: "Neighborhood",
            default: [],
        },
        targetUserIds: {
            type: [Schema.Types.ObjectId],
            ref: "User",
            default: [],
        },
        sentAt: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

CorrespondenceSchema.index({ documentNumber: "text", title: "text" });

export default (mongoose.models.Correspondence as Model<ICorrespondence>) ||
    mongoose.model<ICorrespondence>("Correspondence", CorrespondenceSchema);
