import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IComplaintTypeDefinition extends Document {
    key: string;
    name: string;
    description?: string;
    // Thu tu trong mang the hien UU TIEN dieu huong: xem
    // resolveComplaintTypeRecipientIds trong complaintService.ts - vai tro dung
    // TRUOC trong mang duoc uu tien thu nguoi phu trach truoc.
    allowedReceiverRoles: string[];
    // true = loai duoc seed san tu NHOM_PHAN_ANH (xem scripts/seed-complaint-types.ts)
    // - khoa key/xoa, chi cho sua name/description/allowedReceiverRoles/active.
    isBuiltIn: boolean;
    active: boolean;
    wardCode?: number;
    wardName?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ComplaintTypeDefinitionSchema = new Schema<IComplaintTypeDefinition>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        allowedReceiverRoles: { type: [String], default: [] },
        isBuiltIn: { type: Boolean, default: false },
        active: { type: Boolean, default: true, index: true },
        wardCode: { type: Number, index: true },
        wardName: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

ComplaintTypeDefinitionSchema.index({ wardCode: 1, active: 1, name: 1 });

export default (mongoose.models
    .ComplaintTypeDefinition as Model<IComplaintTypeDefinition>) ||
    mongoose.model<IComplaintTypeDefinition>(
        "ComplaintTypeDefinition",
        ComplaintTypeDefinitionSchema,
    );
