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

export interface IImportRawRow {
    rowNumber: number;
    values: Record<string, string>;
}

export interface IImportJob extends Document {
    type: ImportJobType;
    status: ImportJobStatus;
    fileName: string;
    totalRows: number;
    validRows: number;
    // headers/rawRows: du lieu tho doc tu file, luu lai o buoc upload de buoc
    // "chon cot" (mapping) sau do co the doi chieu/parse lai nhieu lan (vd
    // nguoi dung sua mapping va xem truoc lai) ma khong can tai file len lan
    // nua. Chi dung cho cac loai import can chon cot thu cong (hien tai:
    // "street") - cac loai import khac van dung header co dinh, khong can 2
    // truong nay.
    headers: string[];
    rawRows: IImportRawRow[];
    // Goi y mapping tu dong (doi chieu header phat hien duoc voi nhan mong
    // doi, khong phan biet hoa/thuong/dau) - chi la goi y, nguoi dung co the
    // sua truoc khi ap dung.
    suggestedMapping: Record<string, string>;
    // Mapping THUC TE da duoc ap dung (sau khi nguoi dung xac nhan) - luu lai
    // de doi chieu/audit, khac voi suggestedMapping.
    columnMapping: Record<string, string>;
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
        headers: { type: [String], default: [] },
        rawRows: { type: Schema.Types.Mixed, default: [] },
        suggestedMapping: { type: Schema.Types.Mixed, default: {} },
        columnMapping: { type: Schema.Types.Mixed, default: {} },
        rowErrors: { type: [ImportRowErrorSchema], default: [] },
        previewData: { type: Schema.Types.Mixed, default: [] },
        committedCount: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    // minimize:false - mac dinh Mongoose se xoa hang cac truong Mixed dang
    // object rong ({}) khi luu/serialize (vd suggestedMapping/columnMapping
    // truoc khi nguoi dung chon cot) - can giu nguyen {} de client luon nhan
    // duoc mot object hop le thay vi undefined.
    { timestamps: true, minimize: false },
);

export default (mongoose.models.ImportJob as Model<IImportJob>) ||
    mongoose.model<IImportJob>("ImportJob", ImportJobSchema);
