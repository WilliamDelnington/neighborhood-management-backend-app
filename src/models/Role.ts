import mongoose, { Schema, type Document, type Model } from "mongoose";
import { NHOM_PHAN_ANH, type NhomPhanAnh } from "@/types";

export interface IRole extends Document {
    key: string;
    name: string;
    description?: string;
    permissions: string[];
    // null = khong gioi han (xem tat ca nhom phan anh)
    allowedComplaintCategories: NhomPhanAnh[] | null;
    system: boolean;
    active: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        permissions: { type: [String], default: [] },
        allowedComplaintCategories: {
            type: [String],
            enum: NHOM_PHAN_ANH,
            default: null,
        },
        system: { type: Boolean, default: false },
        active: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
    },
    { timestamps: true },
);

RoleSchema.index({ sortOrder: 1, name: 1 });

export default (mongoose.models.Role as Model<IRole>) ||
    mongoose.model<IRole>("Role", RoleSchema);
