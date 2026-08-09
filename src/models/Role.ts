import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IRole extends Document {
    key: string;
    name: string;
    description?: string;
    permissions: string[];
    allowedComplaintCategories?: string[];
    allowedRequestTypes?: string[];
    system: boolean;
    active: boolean;
    sortOrder: number;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
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
        permissions: { type: [String], default: [], index: true },
        // Khong dat default [] - can phan biet "chua cau hinh" (undefined, xem
        // tat ca nhu truoc day) voi "admin da chot chi cho xem mot so nhom" ([]).
        allowedComplaintCategories: { type: [String], default: undefined },
        // Cung quy uoc voi allowedComplaintCategories: undefined = khong gioi
        // han loai yeu cau duoc gui, [] = admin da chot khong cho gui loai nao.
        allowedRequestTypes: { type: [String], default: undefined },
        system: { type: Boolean, default: false },
        active: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

RoleSchema.index({ active: 1, sortOrder: 1, name: 1 });

export default (mongoose.models.Role as Model<IRole>) ||
    mongoose.model<IRole>("Role", RoleSchema);
