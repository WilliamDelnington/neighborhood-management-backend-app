import mongoose, { Schema, type Document, type Model } from "mongoose";
import type {
    IPeriodicReportAutoSummary,
    IPeriodicReportSections,
} from "./PeriodicReport";
import type { PeriodicReportType } from "@/types";

export interface IPeriodicReportVersion extends Document {
    reportId: mongoose.Types.ObjectId;
    version: number;
    type: PeriodicReportType;
    periodStart: Date;
    periodEnd: Date;
    authorUserId: mongoose.Types.ObjectId;
    submittedByUserId: mongoose.Types.ObjectId;
    submittedToUserId: mongoose.Types.ObjectId;
    neighborhoodId: mongoose.Types.ObjectId;
    sections: IPeriodicReportSections;
    autoSummary: IPeriodicReportAutoSummary;
    attachments: Array<{
        fileAssetId: mongoose.Types.ObjectId;
        name: string;
        url: string;
        mimeType?: string;
        sizeBytes?: number;
    }>;
    submittedAt: Date;
    createdAt: Date;
}

const AttachmentSnapshotSchema = new Schema(
    {
        fileAssetId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        url: { type: String, required: true },
        mimeType: { type: String },
        sizeBytes: { type: Number },
    },
    { _id: false },
);

const PeriodicReportVersionSchema = new Schema<IPeriodicReportVersion>(
    {
        reportId: {
            type: Schema.Types.ObjectId,
            ref: "PeriodicReport",
            required: true,
            immutable: true,
            index: true,
        },
        version: { type: Number, required: true, min: 1, immutable: true },
        type: { type: String, required: true, immutable: true },
        periodStart: { type: Date, required: true, immutable: true },
        periodEnd: { type: Date, required: true, immutable: true },
        authorUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            immutable: true,
        },
        submittedByUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            immutable: true,
        },
        submittedToUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            immutable: true,
        },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            required: true,
            immutable: true,
        },
        sections: { type: Schema.Types.Mixed, required: true, immutable: true },
        autoSummary: { type: Schema.Types.Mixed, required: true, immutable: true },
        attachments: {
            type: [AttachmentSnapshotSchema],
            default: [],
            immutable: true,
        },
        submittedAt: { type: Date, required: true, immutable: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

PeriodicReportVersionSchema.index(
    { reportId: 1, version: 1 },
    { unique: true },
);

export default (mongoose.models
    .PeriodicReportVersion as Model<IPeriodicReportVersion>) ||
    mongoose.model<IPeriodicReportVersion>(
        "PeriodicReportVersion",
        PeriodicReportVersionSchema,
    );
