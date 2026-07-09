import mongoose, { Schema, type Document, type Model } from "mongoose";
import { LOAI_SO_HUU, type LoaiSoHuu } from "@/types";

export interface IHousehold extends Document {
    code: string;
    cluster: string;
    address: string;
    headOfHousehold: string;
    phone?: string;
    memberCount: number;
    ownershipType: LoaiSoHuu;
    needsSupport: boolean;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const HouseholdSchema = new Schema<IHousehold>(
    {
        code: { type: String, required: true, unique: true, index: true },
        cluster: { type: String, required: true, index: true },
        address: { type: String, required: true },
        headOfHousehold: { type: String, required: true },
        phone: { type: String, trim: true },
        memberCount: { type: Number, default: 0 },
        ownershipType: {
            type: String,
            enum: LOAI_SO_HUU,
            default: "chinh_chu",
        },
        needsSupport: { type: Boolean, default: false },
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

HouseholdSchema.index({ address: "text", headOfHousehold: "text" });

export default (mongoose.models.Household as Model<IHousehold>) ||
    mongoose.model<IHousehold>("Household", HouseholdSchema);
