import mongoose, { Schema, type Document, type Model } from "mongoose";
import { MUC_NGUY_CO_PCCC, type MucNguyCoPccc } from "@/types";

export interface IPcccCheck extends Document {
    householdId: mongoose.Types.ObjectId;
    hasFireExtinguisher: boolean;
    hasEmergencyExit: boolean;
    hasIndoorEvCharging: boolean;
    hasGasStoveOrStorageOrBusiness: boolean;
    isCrowdedRental: boolean;
    riskLevel: MucNguyCoPccc;
    remediationNeeded?: string;
    inspectionDate: Date;
    inspectorId: mongoose.Types.ObjectId;
    followUpStatus?: string;
    createdAt: Date;
    updatedAt: Date;
}

const PcccCheckSchema = new Schema<IPcccCheck>(
    {
        householdId: {
            type: Schema.Types.ObjectId,
            ref: "Household",
            required: true,
            index: true,
        },
        hasFireExtinguisher: { type: Boolean, default: false },
        hasEmergencyExit: { type: Boolean, default: false },
        hasIndoorEvCharging: { type: Boolean, default: false },
        hasGasStoveOrStorageOrBusiness: { type: Boolean, default: false },
        isCrowdedRental: { type: Boolean, default: false },
        riskLevel: {
            type: String,
            enum: MUC_NGUY_CO_PCCC,
            default: "xanh",
            index: true,
        },
        remediationNeeded: { type: String },
        inspectionDate: { type: Date, required: true },
        inspectorId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        followUpStatus: { type: String },
    },
    { timestamps: true },
);

export default (mongoose.models.PcccCheck as Model<IPcccCheck>) ||
    mongoose.model<IPcccCheck>("PcccCheck", PcccCheckSchema);
