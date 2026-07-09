import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    LOAI_SO_HUU,
    MUC_DO_AN_NINH,
    type LoaiSoHuu,
    type MucDoAnNinh,
} from "@/types";

export interface ISecurityRecord extends Document {
    householdId: mongoose.Types.ObjectId;
    ownershipType: LoaiSoHuu;
    renterCount: number;
    temporaryResidenceDeclared: boolean;
    hasCamera: boolean;
    hasSecurityComplaint: boolean;
    level: MucDoAnNinh;
    reportedToPolice: boolean;
    handlingStatus?: string;
    note?: string;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const SecurityRecordSchema = new Schema<ISecurityRecord>(
    {
        householdId: {
            type: Schema.Types.ObjectId,
            ref: "Household",
            required: true,
            index: true,
        },
        ownershipType: {
            type: String,
            enum: LOAI_SO_HUU,
            default: "chinh_chu",
        },
        renterCount: { type: Number, default: 0 },
        temporaryResidenceDeclared: { type: Boolean, default: false },
        hasCamera: { type: Boolean, default: false },
        hasSecurityComplaint: { type: Boolean, default: false },
        level: {
            type: String,
            enum: MUC_DO_AN_NINH,
            default: "binh_thuong",
            index: true,
        },
        reportedToPolice: { type: Boolean, default: false },
        handlingStatus: { type: String },
        note: { type: String },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.SecurityRecord as Model<ISecurityRecord>) ||
    mongoose.model<ISecurityRecord>("SecurityRecord", SecurityRecordSchema);
