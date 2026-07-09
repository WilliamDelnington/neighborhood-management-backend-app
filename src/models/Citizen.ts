import mongoose, { Schema, type Document, type Model } from "mongoose";
import { GIOI_TINH, LOAI_CU_TRU, type GioiTinh, type LoaiCuTru } from "@/types";

export interface ICitizen extends Document {
    fullName: string;
    phone?: string;
    cccd?: string;
    birthDate?: Date;
    gender: GioiTinh;
    relationToHead?: string;
    householdId: mongoose.Types.ObjectId;
    residenceType: LoaiCuTru;
    isElderly: boolean;
    isChild: boolean;
    isDisabledOrSupportNeeded: boolean;
    isPartyMember: boolean;
    isUnionMember: boolean;
    zaloUserId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CitizenSchema = new Schema<ICitizen>(
    {
        fullName: { type: String, required: true, trim: true },
        phone: { type: String, trim: true },
        cccd: { type: String, trim: true, index: true },
        birthDate: { type: Date },
        gender: { type: String, enum: GIOI_TINH, default: "nam" },
        relationToHead: { type: String },
        householdId: {
            type: Schema.Types.ObjectId,
            ref: "Household",
            required: true,
            index: true,
        },
        residenceType: {
            type: String,
            enum: LOAI_CU_TRU,
            default: "thuong_tru",
        },
        isElderly: { type: Boolean, default: false },
        isChild: { type: Boolean, default: false },
        isDisabledOrSupportNeeded: { type: Boolean, default: false },
        isPartyMember: { type: Boolean, default: false },
        isUnionMember: { type: Boolean, default: false },
        zaloUserId: { type: Schema.Types.ObjectId, ref: "User" },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

CitizenSchema.index({ fullName: "text", cccd: "text", phone: "text" });

export default (mongoose.models.Citizen as Model<ICitizen>) ||
    mongoose.model<ICitizen>("Citizen", CitizenSchema);
