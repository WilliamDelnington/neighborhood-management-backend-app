import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IZaloWebhookEvent extends Document {
    appId: string;
    eventName: string;
    // Nguyen van payload Zalo gui (da parse tu JSON) - luu lai toan bo de con
    // tra cuu/xu ly thu cong neu can, vi chua chac chan ten field chinh xac cho
    // moi loai su kien (dac biet su kien "nguoi dung thuc hien quyen chu the du
    // lieu" - rut lai su dong y / xoa du lieu - Zalo moi bo sung, tai lieu cong
    // khai chua liet ke day du field).
    payload: Record<string, unknown>;
    signatureValid: boolean;
    // true khi da xu ly xong (vd: da xoa/anonymize du lieu nguoi dung tuong
    // ung voi su kien rut lai su dong y). Cho phep doi soat sau nay neu handler
    // tu dong chua nhan dien duoc dung ten su kien.
    processedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ZaloWebhookEventSchema = new Schema<IZaloWebhookEvent>(
    {
        appId: { type: String, required: true },
        eventName: { type: String, required: true, index: true },
        payload: { type: Schema.Types.Mixed, required: true },
        signatureValid: { type: Boolean, required: true },
        processedAt: { type: Date },
    },
    { timestamps: true },
);

export default (mongoose.models.ZaloWebhookEvent as Model<IZaloWebhookEvent>) ||
    mongoose.model<IZaloWebhookEvent>("ZaloWebhookEvent", ZaloWebhookEventSchema);
