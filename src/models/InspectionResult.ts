import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    INSPECTION_OUTCOME,
    INSPECTION_RESULT_STATUS,
    INSPECTION_SUBMITTED_BY,
    type InspectionOutcome,
    type InspectionResultStatus,
    type InspectionSubmittedBy,
} from "@/types";

export interface IInspectionResult extends Document {
    targetId: mongoose.Types.ObjectId;
    submittedBy: InspectionSubmittedBy;
    submittedByUserId: mongoose.Types.ObjectId;
    gpsLat?: number;
    gpsLng?: number;
    note?: string;
    outcome?: InspectionOutcome;
    verifiedByUserId?: mongoose.Types.ObjectId;
    verifiedAt?: Date;
    reviewNote?: string;
    status: InspectionResultStatus;
    submittedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const InspectionResultSchema = new Schema<IInspectionResult>(
    {
        targetId: {
            type: Schema.Types.ObjectId,
            ref: "InspectionTarget",
            required: true,
            unique: true,
            index: true,
        },
        submittedBy: {
            type: String,
            enum: INSPECTION_SUBMITTED_BY,
            required: true,
        },
        submittedByUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        gpsLat: { type: Number, min: -90, max: 90 },
        gpsLng: { type: Number, min: -180, max: 180 },
        note: { type: String, trim: true },
        outcome: { type: String, enum: INSPECTION_OUTCOME },
        verifiedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
        verifiedAt: { type: Date },
        reviewNote: { type: String, trim: true },
        status: {
            type: String,
            enum: INSPECTION_RESULT_STATUS,
            default: "DRAFT",
            index: true,
        },
        submittedAt: { type: Date },
    },
    { timestamps: true },
);

export default (mongoose.models.InspectionResult as Model<IInspectionResult>) ||
    mongoose.model<IInspectionResult>("InspectionResult", InspectionResultSchema);
