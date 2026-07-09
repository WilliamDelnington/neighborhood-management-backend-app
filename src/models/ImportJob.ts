import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    IMPORT_JOB_STATUS,
    IMPORT_JOB_TYPE,
    type ImportJobStatus,
    type ImportJobType,
} from "@/types";

export interface IImportRowError {
    row: number;
    message: string;
}

export interface IImportJob extends Document {
    type: ImportJobType;
    status: ImportJobStatus;
    fileName: string;
    totalRows: number;
    validRows: number;
    rowErrors: IImportRowError[];
    previewData: Record<string, unknown>[];
    committedCount: number;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ImportRowErrorSchema = new Schema<IImportRowError>(
    {
        row: { type: Number, required: true },
        message: { type: String, required: true },
    },
    { _id: false },
);

const ImportJobSchema = new Schema<IImportJob>(
    {
        type: { type: String, enum: IMPORT_JOB_TYPE, required: true },
        status: {
            type: String,
            enum: IMPORT_JOB_STATUS,
            default: "previewing",
        },
        fileName: { type: String, required: true },
        totalRows: { type: Number, default: 0 },
        validRows: { type: Number, default: 0 },
        rowErrors: { type: [ImportRowErrorSchema], default: [] },
        previewData: { type: Schema.Types.Mixed, default: [] },
        committedCount: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true },
);

export default (mongoose.models.ImportJob as Model<IImportJob>) ||
    mongoose.model<IImportJob>("ImportJob", ImportJobSchema);
