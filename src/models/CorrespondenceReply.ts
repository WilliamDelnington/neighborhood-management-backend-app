import mongoose, { Schema, type Document, type Model } from "mongoose";

// Danh sach phan hoi noi tiep (append-only) cho mot Van ban - cung dang voi
// ComplaintTimeline.ts, vi ca hai chieu (nguoi gui va nguoi nhan) co the phan
// hoi qua lai nhieu lan.
export interface ICorrespondenceReply extends Document {
    correspondenceId: mongoose.Types.ObjectId;
    content: string;
    actorId: mongoose.Types.ObjectId;
    createdAt: Date;
}

const CorrespondenceReplySchema = new Schema<ICorrespondenceReply>(
    {
        correspondenceId: {
            type: Schema.Types.ObjectId,
            ref: "Correspondence",
            required: true,
            index: true,
        },
        content: { type: String, required: true, trim: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

export default (mongoose.models
    .CorrespondenceReply as Model<ICorrespondenceReply>) ||
    mongoose.model<ICorrespondenceReply>(
        "CorrespondenceReply",
        CorrespondenceReplySchema,
    );
