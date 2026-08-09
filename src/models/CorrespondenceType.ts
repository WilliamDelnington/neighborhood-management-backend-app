import mongoose, { Schema, type Document, type Model } from "mongoose";

// Loai van ban (Cong van, Bao cao, De xuat, Kien nghi...) - danh muc dong, cung
// mau voi DocumentType.ts (giay to kinh doanh) nhung khac domain (van ban noi
// bo giua can bo/to truong, khong phai giay to cong dan/doanh nghiep).
// allowedSenderRoles/allowedReceiverRoles la "ma tran" thuc su: quyen
// correspondences.* chi la cong tho, con viec "vai tro nay co duoc gui/nhan
// loai van ban nay khong" do 2 mang nay quyet dinh - xem correspondenceService.ts.
export interface ICorrespondenceType extends Document {
    name: string;
    code: string;
    description?: string;
    allowedSenderRoles: string[];
    allowedReceiverRoles: string[];
    requireDocumentNumber: boolean;
    active: boolean;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CorrespondenceTypeSchema = new Schema<ICorrespondenceType>(
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
        allowedSenderRoles: { type: [String], default: [] },
        allowedReceiverRoles: { type: [String], default: [] },
        requireDocumentNumber: { type: Boolean, default: false },
        active: { type: Boolean, default: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models
    .CorrespondenceType as Model<ICorrespondenceType>) ||
    mongoose.model<ICorrespondenceType>(
        "CorrespondenceType",
        CorrespondenceTypeSchema,
    );
