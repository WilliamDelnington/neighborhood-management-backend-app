import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    MUC_NGUY_CO_PCCC,
    TINH_TRANG_THEO_DOI_PCCC,
    type MucNguyCoPccc,
    type TinhTrangTheoDoiPccc,
} from "@/types";

export interface IPcccCheck extends Document {
    houseId: mongoose.Types.ObjectId;
    hasFireExtinguisher: boolean;
    hasEmergencyExit: boolean;
    hasIndoorEvCharging: boolean;
    hasGasStoveOrStorageOrBusiness: boolean;
    isCrowdedRental: boolean;
    riskLevel: MucNguyCoPccc;
    remediationNeeded?: string;
    inspectionDate: Date;
    inspectorId: mongoose.Types.ObjectId;
    followUpStatus: TinhTrangTheoDoiPccc;
    deadline?: Date;
    assigneeId?: mongoose.Types.ObjectId;
    // Danh dau da gui canh bao qua han cho lan deadline hien tai - tranh gui lap
    // moi lan job kiem tra chay. Duoc xoa (undefined) khi giao lai/doi han moi.
    deadlineWarnedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PcccCheckSchema = new Schema<IPcccCheck>(
    {
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
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
        followUpStatus: {
            type: String,
            enum: TINH_TRANG_THEO_DOI_PCCC,
            default: "chua_khac_phuc",
        },
        deadline: { type: Date, index: true },
        assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
        deadlineWarnedAt: { type: Date },
    },
    { timestamps: true },
);

export default (mongoose.models.PcccCheck as Model<IPcccCheck>) ||
    mongoose.model<IPcccCheck>("PcccCheck", PcccCheckSchema);
