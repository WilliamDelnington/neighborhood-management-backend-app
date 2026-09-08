import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    TRANG_THAI_YEU_CAU_DAT_LAI_MAT_KHAU,
    type TrangThaiYeuCauDatLaiMatKhau,
} from "@/types";

// Gui boi nguoi dung KHONG dang nhap duoc (quen mat khau) - dinh danh bang so
// dien thoai thay vi createdByUserId nhu SupportTicket. Nhan vien co
// users.reset_password (admin/to truong/to pho) xem danh sach nay, goi dien
// xac minh roi dat lai mat khau qua man Nguoi dung (resetUserPasswordByAdmin),
// sau do danh dau da xu ly o day.
export interface IPasswordResetRequest extends Document {
    phone: string;
    note?: string;
    status: TrangThaiYeuCauDatLaiMatKhau;
    resolvedByUserId?: mongoose.Types.ObjectId;
    resolvedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PasswordResetRequestSchema = new Schema<IPasswordResetRequest>(
    {
        phone: { type: String, required: true, trim: true, index: true },
        note: { type: String, trim: true },
        status: {
            type: String,
            enum: TRANG_THAI_YEU_CAU_DAT_LAI_MAT_KHAU,
            default: "moi",
            index: true,
        },
        resolvedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
        resolvedAt: { type: Date },
    },
    { timestamps: true },
);

PasswordResetRequestSchema.index({ status: 1, createdAt: -1 });

export default (mongoose.models
    .PasswordResetRequest as Model<IPasswordResetRequest>) ||
    mongoose.model<IPasswordResetRequest>(
        "PasswordResetRequest",
        PasswordResetRequestSchema,
    );
