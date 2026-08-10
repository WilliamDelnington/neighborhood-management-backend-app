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
    status: PeriodicReportStatus;
    submittedToUserId?: mongoose.Types.ObjectId;
    submittedAt?: Date;
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
        status: {
            type: String,
            enum: PERIODIC_REPORT_STATUS,
            default: "draft",
            index: true,
        },
        submittedToUserId: { type: Schema.Types.ObjectId, ref: "User" },
        submittedAt: { type: Date },
        revisionNote: { type: String, trim: true },
    },
    { timestamps: true },
);

PeriodicReportSchema.index({ authorUserId: 1, status: 1, createdAt: -1 });

export default (mongoose.models
    .PeriodicReport as Model<IPeriodicReport>) ||
    mongoose.model<IPeriodicReport>("PeriodicReport", PeriodicReportSchema);
