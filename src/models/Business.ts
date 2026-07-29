import mongoose, { Schema, type Document, type Model } from "mongoose";
import { BUSINESS_STATUS, type BusinessStatus } from "@/types";

export interface IBusiness extends Document {
    name: string;
    houseId: mongoose.Types.ObjectId;
    cluster: string;
    businessType?: mongoose.Types.ObjectId;
    ownerName?: string;
    phone?: string;
    active: boolean;
    status: BusinessStatus;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const BusinessSchema = new Schema<IBusiness>(
    {
        name: { type: String, required: true, trim: true },
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        cluster: { type: String, required: true, index: true },
        businessType: { type: Schema.Types.ObjectId, ref: "BusinessType" },
        ownerName: { type: String, trim: true },
        phone: { type: String, trim: true },
        active: { type: Boolean, default: true },
        // Trang thai xac thuc ho kinh doanh - cung 5 trang thai va luong
        // chuyen doi nhu nha so (xem transitionBusinessStatus).
        status: {
            type: String,
            enum: BUSINESS_STATUS,
            default: "unverified",
            index: true,
        },
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

BusinessSchema.index({ name: "text" });

export default (mongoose.models.Business as Model<IBusiness>) ||
    mongoose.model<IBusiness>("Business", BusinessSchema);
