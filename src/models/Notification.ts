import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    NOTIFICATION_CHANNEL,
    NOTIFICATION_STATUS,
    type NotificationChannel,
    type NotificationStatus,
    type Role,
} from "@/types";

export interface INotification extends Document {
    title: string;
    body: string;
    type: string;
    targetRoles: Role[];
    targetClusters: string[];
    targetUserIds: mongoose.Types.ObjectId[];
    relatedModel?: string;
    relatedId?: mongoose.Types.ObjectId;
    channel: NotificationChannel;
    status: NotificationStatus;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
    {
        title: { type: String, required: true },
        body: { type: String, required: true },
        type: { type: String, required: true },
        targetRoles: { type: [String], default: [] },
        targetClusters: { type: [String], default: [] },
        targetUserIds: {
            type: [Schema.Types.ObjectId],
            ref: "User",
            default: [],
        },
        relatedModel: { type: String },
        relatedId: { type: Schema.Types.ObjectId },
        channel: {
            type: String,
            enum: NOTIFICATION_CHANNEL,
            default: "in_app",
        },
        status: { type: String, enum: NOTIFICATION_STATUS, default: "queued" },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Notification as Model<INotification>) ||
    mongoose.model<INotification>("Notification", NotificationSchema);
