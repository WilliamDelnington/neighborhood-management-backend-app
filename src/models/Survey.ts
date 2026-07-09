import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    LOAI_CAU_HOI_KHAO_SAT,
    TRANG_THAI_KHAO_SAT,
    type LoaiCauHoiKhaoSat,
    type TrangThaiKhaoSat,
    type Role,
} from "@/types";

export interface ISurveyQuestion {
    _id?: mongoose.Types.ObjectId;
    question: string;
    type: LoaiCauHoiKhaoSat;
    options: string[];
    required: boolean;
}

export interface ISurvey extends Document {
    title: string;
    description?: string;
    questions: ISurveyQuestion[];
    status: TrangThaiKhaoSat;
    openDate?: Date;
    closeDate?: Date;
    eligibleRoles: Role[];
    eligibleClusters: string[];
    eligibleAll: boolean;
    createdBy: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const SurveyQuestionSchema = new Schema<ISurveyQuestion>(
    {
        question: { type: String, required: true },
        type: { type: String, enum: LOAI_CAU_HOI_KHAO_SAT, required: true },
        options: { type: [String], default: [] },
        required: { type: Boolean, default: true },
    },
    { _id: true },
);

const SurveySchema = new Schema<ISurvey>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String },
        questions: { type: [SurveyQuestionSchema], default: [] },
        status: {
            type: String,
            enum: TRANG_THAI_KHAO_SAT,
            default: "nhap",
            index: true,
        },
        openDate: { type: Date },
        closeDate: { type: Date },
        eligibleRoles: { type: [String], default: [] },
        eligibleClusters: { type: [String], default: [] },
        eligibleAll: { type: Boolean, default: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Survey as Model<ISurvey>) ||
    mongoose.model<ISurvey>("Survey", SurveySchema);
