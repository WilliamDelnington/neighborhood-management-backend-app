import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    LOAI_TIN_TUC,
    TRANG_THAI_TIN_TUC,
    type LoaiTinTuc,
    type TrangThaiTinTuc,
} from "@/types";

export interface INews extends Document {
    title: string;
    category: LoaiTinTuc;
    content: string;
    status: TrangThaiTinTuc;
    pinned: boolean;
    coverImageUrl?: string;
    images: string[];
    publishedAt?: Date;
    createdBy: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const NewsSchema = new Schema<INews>(
    {
        title: { type: String, required: true, trim: true },
        category: { type: String, enum: LOAI_TIN_TUC, default: "chung" },
        content: { type: String, required: true },
        status: {
            type: String,
            enum: TRANG_THAI_TIN_TUC,
            default: "nhap",
            index: true,
        },
        pinned: { type: Boolean, default: false },
        coverImageUrl: { type: String },
        images: { type: [String], default: [] },
        publishedAt: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

NewsSchema.index({ title: "text", content: "text" });

export default (mongoose.models.News as Model<INews>) ||
    mongoose.model<INews>("News", NewsSchema);
