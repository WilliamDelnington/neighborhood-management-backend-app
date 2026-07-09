import mongoose, { Schema, type Document, type Model } from "mongoose";
import { NOTIFICATION_CHANNEL, type NotificationChannel } from "@/types";

export interface INotificationDelivery extends Document {
    notificationId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    channel: NotificationChannel;
    readAt?: Date;
    sentAt?: Date;
    failedAt?: Date;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationDeliverySchema = new Schema<INotificationDelivery>(
    {
        notificationId: {
            type: Schema.Types.ObjectId,
            ref: "Notification",
            required: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        channel: {
            type: String,
            enum: NOTIFICATION_CHANNEL,
            default: "in_app",
        },
        readAt: { type: Date },
        sentAt: { type: Date },
        failedAt: { type: Date },
        error: { type: String },
    },
    { timestamps: true },
);

NotificationDeliverySchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export default (mongoose.models
    .NotificationDelivery as Model<INotificationDelivery>) ||
    mongoose.model<INotificationDelivery>(
        "NotificationDelivery",
        NotificationDeliverySchema,
    );
