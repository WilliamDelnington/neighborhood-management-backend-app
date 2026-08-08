import mongoose, { Schema, type Document, type Model } from "mongoose";
import { REQUEST_STATUS, type RequestStatus } from "@/types";

export interface IRequestRecipient extends Document {
    requestId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    status: RequestStatus;
    note?: string;
    respondedAt?: Date;
    resolvedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const RequestRecipientSchema = new Schema<IRequestRecipient>(
    {
        requestId: {
            type: Schema.Types.ObjectId,
            ref: "Request",
            required: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        status: { type: String, enum: REQUEST_STATUS, default: "pending" },
        note: { type: String, trim: true },
        respondedAt: { type: Date },
        resolvedAt: { type: Date },
    },
    { timestamps: true },
);

RequestRecipientSchema.index({ requestId: 1, userId: 1 }, { unique: true });
RequestRecipientSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default (mongoose.models
    .RequestRecipient as Model<IRequestRecipient>) ||
    mongoose.model<IRequestRecipient>(
        "RequestRecipient",
        RequestRecipientSchema,
    );
