import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    LOAI_THONG_BAO,
    TRANG_THAI_THONG_BAO,
    type LoaiThongBao,
    type TrangThaiThongBao,
    type Role,
} from "@/types";

export interface IAnnouncement extends Document {
    title: string;
    content: string;
    category: LoaiThongBao;
    status: TrangThaiThongBao;
    priority: boolean;
    pinned: boolean;
    targetRoles: Role[];
    targetClusters: string[];
    // Doi tuong doc gia moi (thay the targetClusters khong hoat dong voi
    // house_owner - xem ghi chu trong announcementService.ts). targetUserIds
    // gui toi dung nhung nguoi duoc chon; targetNeighborhoodIds gui toi chu
    // cac nha thuoc nhung to dan pho duoc chon. Ca hai co the ket hop.
    targetUserIds: mongoose.Types.ObjectId[];
    targetNeighborhoodIds: mongoose.Types.ObjectId[];
    isUrgent: boolean;
    audienceAll: boolean;
    // Pham vi TAC GIA (ai duoc sua/xoa/xem trong danh sach quan tri) khi nguoi
    // tao la neighborhood_leader - khac hoan toan voi targetClusters (doi
    // tuong doc gia). undefined = tao boi admin/secretary, khong bi gioi han
    // theo to dan pho.
    neighborhoodId?: mongoose.Types.ObjectId;
    publishedAt?: Date;
    createdBy: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
    {
        title: { type: String, required: true, trim: true },
        content: { type: String, required: true },
        category: { type: String, enum: LOAI_THONG_BAO, default: "chung" },
        status: {
            type: String,
            enum: TRANG_THAI_THONG_BAO,
            default: "nhap",
            index: true,
        },
        priority: { type: Boolean, default: false },
        pinned: { type: Boolean, default: false },
        targetRoles: { type: [String], default: [] },
        targetClusters: { type: [String], default: [] },
        targetUserIds: {
            type: [Schema.Types.ObjectId],
            ref: "User",
            default: [],
        },
        targetNeighborhoodIds: {
            type: [Schema.Types.ObjectId],
            ref: "Neighborhood",
            default: [],
        },
        isUrgent: { type: Boolean, default: false },
        audienceAll: { type: Boolean, default: true },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        publishedAt: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

AnnouncementSchema.index({ title: "text", content: "text" });

export default (mongoose.models.Announcement as Model<IAnnouncement>) ||
    mongoose.model<IAnnouncement>("Announcement", AnnouncementSchema);
