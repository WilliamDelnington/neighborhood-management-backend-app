import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IMeeting extends Document {
    title: string;
    startTime: Date;
    location: string;
    content: string;
    minutes?: string;
    attachments: string[];
    published: boolean;
    createdBy: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
    {
        title: { type: String, required: true, trim: true },
        startTime: { type: Date, required: true, index: true },
        location: { type: String, required: true },
        content: { type: String, required: true },
        minutes: { type: String },
        attachments: { type: [String], default: [] },
        published: { type: Boolean, default: false },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Meeting as Model<IMeeting>) ||
    mongoose.model<IMeeting>("Meeting", MeetingSchema);
