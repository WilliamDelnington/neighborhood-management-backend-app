import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IBusiness extends Document {
    name: string;
    houseId: mongoose.Types.ObjectId;
    cluster: string;
    businessType?: mongoose.Types.ObjectId;
    ownerName?: string;
    phone?: string;
    active: boolean;
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
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

BusinessSchema.index({ name: "text" });

export default (mongoose.models.Business as Model<IBusiness>) ||
    mongoose.model<IBusiness>("Business", BusinessSchema);
