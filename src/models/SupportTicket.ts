import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    LOAI_YEU_CAU_HO_TRO,
    TRANG_THAI_YEU_CAU_HO_TRO,
    type LoaiYeuCauHoTro,
    type TrangThaiYeuCauHoTro,
} from "@/types";

export interface ISupportTicket extends Document {
    code: string;
    type: LoaiYeuCauHoTro;
    title: string;
    content: string;
    images: string[];
    deviceInfo?: string;
    status: TrangThaiYeuCauHoTro;
    createdByUserId: mongoose.Types.ObjectId;
    adminResponse?: string;
    respondedByUserId?: mongoose.Types.ObjectId;
    resolvedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
    {
        code: { type: String, required: true, unique: true, index: true },
        type: { type: String, enum: LOAI_YEU_CAU_HO_TRO, required: true },
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
        images: { type: [String], default: [] },
        deviceInfo: { type: String },
        status: {
            type: String,
            enum: TRANG_THAI_YEU_CAU_HO_TRO,
            default: "moi",
            index: true,
        },
        createdByUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        adminResponse: { type: String },
        respondedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
        resolvedAt: { type: Date },
    },
    { timestamps: true },
);

SupportTicketSchema.index({ title: "text", content: "text" });
SupportTicketSchema.index({ type: 1, status: 1, createdAt: -1 });

export default (mongoose.models.SupportTicket as Model<ISupportTicket>) ||
    mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);
