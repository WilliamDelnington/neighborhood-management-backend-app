import mongoose, { Schema, type Document, type Model } from "mongoose";
import { TRANG_THAI_PHAN_ANH, type TrangThaiPhanAnh } from "@/types";

export interface IComplaintTimeline extends Document {
    complaintId: mongoose.Types.ObjectId;
    status: TrangThaiPhanAnh;
    note?: string;
    isPublic: boolean;
    actorId: mongoose.Types.ObjectId;
    createdAt: Date;
}

const ComplaintTimelineSchema = new Schema<IComplaintTimeline>(
    {
        complaintId: {
            type: Schema.Types.ObjectId,
            ref: "Complaint",
            required: true,
            index: true,
        },
        status: { type: String, enum: TRANG_THAI_PHAN_ANH, required: true },
        note: { type: String },
        isPublic: { type: Boolean, default: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

export default (mongoose.models
    .ComplaintTimeline as Model<IComplaintTimeline>) ||
    mongoose.model<IComplaintTimeline>(
        "ComplaintTimeline",
        ComplaintTimelineSchema,
    );
