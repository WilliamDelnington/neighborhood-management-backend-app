import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    MUC_DO_AN_NINH,
    TINH_TRANG_THEO_DOI_AN_NINH,
    type MucDoAnNinh,
    type TinhTrangTheoDoiAnNinh,
} from "@/types";

export interface ISecurityRecord extends Document {
    houseId: mongoose.Types.ObjectId;
    hasCamera: boolean;
    hasSecurityComplaint: boolean;
    level: MucDoAnNinh;
    reportedToPolice: boolean;
    monitoringStatus: TinhTrangTheoDoiAnNinh;
    note?: string;
    inspectionDate: Date;
    createdBy?: mongoose.Types.ObjectId;
    assigneeId?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const SecurityRecordSchema = new Schema<ISecurityRecord>(
    {
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        hasCamera: { type: Boolean, default: false },
        hasSecurityComplaint: { type: Boolean, default: false },
        level: {
            type: String,
            enum: MUC_DO_AN_NINH,
            default: "binh_thuong",
            index: true,
        },
        reportedToPolice: { type: Boolean, default: false },
        monitoringStatus: {
            type: String,
            enum: TINH_TRANG_THEO_DOI_AN_NINH,
            default: "binh_thuong",
            index: true,
        },
        note: { type: String },
        // Khong danh dau required o schema: ho so cu (truoc khi co truong nay)
        // van phai .save() duoc binh thuong khi chi sua truong khac. Zod
        // (validators/security.ts) moi la noi bat buoc gia tri nay khi TAO moi.
        inspectionDate: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.SecurityRecord as Model<ISecurityRecord>) ||
    mongoose.model<ISecurityRecord>("SecurityRecord", SecurityRecordSchema);
