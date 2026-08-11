import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    PERIODIC_REPORT_TYPES,
    PERIODIC_REPORT_STATUS,
    type PeriodicReportType,
    type PeriodicReportStatus,
} from "@/types";

export interface IPeriodicReportSections {
    generalSituation?: string;
    highlights?: string;
    recommendations?: string;
    proposals?: string;
}

export interface IPeriodicReportAutoSummary {
    tasks: { received: number; completed: number; overdue: number };
    feedback: {
        received: number;
        verified: number;
        forwarded: number;
        pending: number;
    };
    inspections: {
        total: number;
        completed: number;
        passed: number;
        failed: number;
        pending: number;
        revisionRequired: number;
        fieldCheckRequired: number;
    };
    cases: { total: number; open: number; resolved: number };
    generatedAt: Date;
}

// Bao cao dinh ky To/nhan vien nop len Phuong (B12) - tac gia KHONG gioi han
// To truong (dung theo yeu cau: "Neighborhood Leader and staffs should
// provide reports as well"). neighborhoodId chi dat khi tac gia dai dien mot
// To dan pho cu the.
export interface IPeriodicReport extends Document {
    type: PeriodicReportType;
    periodStart: Date;
    periodEnd: Date;
    authorUserId: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    sections: IPeriodicReportSections;
    autoSummary: IPeriodicReportAutoSummary;
    status: PeriodicReportStatus;
    submittedToUserId?: mongoose.Types.ObjectId;
    submittedAt?: Date;
    currentVersion: number;
    receivedAt?: Date;
    receivedByUserId?: mongoose.Types.ObjectId;
    acceptedAt?: Date;
    acceptedByUserId?: mongoose.Types.ObjectId;
    recalledAt?: Date;
    revisionRequestedAt?: Date;
    revisionRequestedByUserId?: mongoose.Types.ObjectId;
    revisionNote?: string;
    createdAt: Date;
    updatedAt: Date;
}

const PeriodicReportSchema = new Schema<IPeriodicReport>(
    {
        type: {
            type: String,
            enum: PERIODIC_REPORT_TYPES,
            required: true,
            index: true,
        },
        periodStart: { type: Date, required: true },
        periodEnd: { type: Date, required: true },
        authorUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        sections: {
            generalSituation: { type: String },
            highlights: { type: String },
            recommendations: { type: String },
            proposals: { type: String },
        },
        autoSummary: {
            tasks: {
                received: { type: Number, default: 0 },
                completed: { type: Number, default: 0 },
                overdue: { type: Number, default: 0 },
            },
            feedback: {
                received: { type: Number, default: 0 },
                verified: { type: Number, default: 0 },
                forwarded: { type: Number, default: 0 },
                pending: { type: Number, default: 0 },
            },
            inspections: {
                total: { type: Number, default: 0 },
                completed: { type: Number, default: 0 },
                passed: { type: Number, default: 0 },
                failed: { type: Number, default: 0 },
                pending: { type: Number, default: 0 },
                revisionRequired: { type: Number, default: 0 },
                fieldCheckRequired: { type: Number, default: 0 },
            },
            cases: {
                total: { type: Number, default: 0 },
                open: { type: Number, default: 0 },
                resolved: { type: Number, default: 0 },
            },
            generatedAt: { type: Date, default: Date.now },
        },
        status: {
            type: String,
            enum: PERIODIC_REPORT_STATUS,
            default: "draft",
            index: true,
        },
        submittedToUserId: { type: Schema.Types.ObjectId, ref: "User" },
        submittedAt: { type: Date },
        currentVersion: { type: Number, default: 0, min: 0 },
        receivedAt: { type: Date },
        receivedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
        acceptedAt: { type: Date },
        acceptedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
        recalledAt: { type: Date },
        revisionRequestedAt: { type: Date },
        revisionRequestedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
        revisionNote: { type: String, trim: true },
    },
    { timestamps: true },
);

PeriodicReportSchema.index({ authorUserId: 1, status: 1, createdAt: -1 });

export default (mongoose.models
    .PeriodicReport as Model<IPeriodicReport>) ||
    mongoose.model<IPeriodicReport>("PeriodicReport", PeriodicReportSchema);
