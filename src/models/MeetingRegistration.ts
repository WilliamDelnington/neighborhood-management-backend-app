import mongoose, { Schema, type Document, type Model } from "mongoose";
import { DANG_KY_HOP, type DangKyHop } from "@/types";

export interface IMeetingRegistration extends Document {
    meetingId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    answer: DangKyHop;
    delegateName?: string;
    createdAt: Date;
    updatedAt: Date;
}

const MeetingRegistrationSchema = new Schema<IMeetingRegistration>(
    {
        meetingId: {
            type: Schema.Types.ObjectId,
            ref: "Meeting",
            required: true,
        },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        answer: { type: String, enum: DANG_KY_HOP, required: true },
        delegateName: { type: String },
    },
    { timestamps: true },
);

MeetingRegistrationSchema.index({ meetingId: 1, userId: 1 }, { unique: true });

export default (mongoose.models
    .MeetingRegistration as Model<IMeetingRegistration>) ||
    mongoose.model<IMeetingRegistration>(
        "MeetingRegistration",
        MeetingRegistrationSchema,
    );
