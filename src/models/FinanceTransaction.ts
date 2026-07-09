import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    LOAI_GIAO_DICH_TAI_CHINH,
    TRANG_THAI_GIAO_DICH,
    type LoaiGiaoDichTaiChinh,
    type TrangThaiGiaoDich,
} from "@/types";

export interface IFinanceTransaction extends Document {
    type: LoaiGiaoDichTaiChinh;
    partyName: string;
    amount: number;
    transactionDate: Date;
    content: string;
    status: TrangThaiGiaoDich;
    createdBy: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const FinanceTransactionSchema = new Schema<IFinanceTransaction>(
    {
        type: {
            type: String,
            enum: LOAI_GIAO_DICH_TAI_CHINH,
            required: true,
            index: true,
        },
        partyName: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        transactionDate: { type: Date, required: true, index: true },
        content: { type: String, required: true },
        status: { type: String, enum: TRANG_THAI_GIAO_DICH, default: "nhap" },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models
    .FinanceTransaction as Model<IFinanceTransaction>) ||
    mongoose.model<IFinanceTransaction>(
        "FinanceTransaction",
        FinanceTransactionSchema,
    );
