import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    TRANG_THAI_YEU_CAU_DAT_LAI_MAT_KHAU,
    type TrangThaiYeuCauDatLaiMatKhau,
} from "@/types";

// Gui boi nguoi dung KHONG dang nhap duoc (quen mat khau) - dinh danh bang so
// dien thoai thay vi createdByUserId nhu SupportTicket. Nhan vien co
// users.reset_password (admin/to truong/to pho phu trach - xem
// resolveResponsibleLeaderIds) bam nut "Dat lai mat khau" tren danh sach nay
// (resetPasswordForRequest, tu sinh mat khau ngau nhien - khong con phai go
// tay qua man Nguoi dung nhu truoc). Nguoi dung tu lay lai mat khau do bang
// cach nhap lai so dien thoai o man dang nhap (checkPasswordResetRequestByPhone
// + revealPasswordResetRequest) - chua co SMS/Zalo OA that (xem
// notification_channels).
export interface IPasswordResetRequest extends Document {
    phone: string;
    note?: string;
    status: TrangThaiYeuCauDatLaiMatKhau;
    resolvedByUserId?: mongoose.Types.ObjectId;
    resolvedAt?: Date;
    generatedPassword?: string;
    revealedAt?: Date;
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
        // Mat khau ngau nhien do resetPasswordForRequest (to truong/nhan vien
        // bam nut "Dat lai mat khau") sinh ra - luu TAM THOI o day (day la
        // KENH duy nhat de nguoi dung tu lay lai mat khau moi, do chua tich
        // hop SMS/Zalo OA - xem notification_channels). Bi xoa ngay sau khi
        // citizen goi /reveal (revealPasswordResetRequest) de khong ai lay
        // lai duoc lan thu hai.
        generatedPassword: { type: String, select: false },
        revealedAt: { type: Date },
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
