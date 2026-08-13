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
    eligibleStreetIds: mongoose.Types.ObjectId[];
    eligibleNeighborhoodIds: mongoose.Types.ObjectId[];
    eligibleBusinessTypeIds: mongoose.Types.ObjectId[];
    eligibleAll: boolean;
    // Nhan xet/tong hop cua nguoi phu trach sau khi co ket qua (B08.06) - hien
    // thi canh ket qua tho, KHONG thay doi cau tra loi cua nguoi dan.
    resultSummary?: string;
    createdBy: mongoose.Types.ObjectId;
    // Nguoi duoc chu khao sat (createdBy) uy quyen cung chinh sua/mo/dong/xoa -
    // xem surveyService.assertSurveyEditable. Phai la tai khoan dang co quyen
    // "surveys.update" tai thoi diem duoc them (assertUsersCanCoEdit), nhung
    // KHONG tu dong bi go neu quyen do bi thu hoi sau nay (giu nguyen cho toi
    // khi chu khao sat/admin chu dong sua lai danh sach).
    coEditorUserIds: mongoose.Types.ObjectId[];
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
        // Legacy - khong con dung de gioi han (xem eligibleStreetIds thay
        // the), giu lai de khong pha vo du lieu khao sat da tao truoc do.
        eligibleClusters: { type: [String], default: [] },
        eligibleStreetIds: {
            type: [Schema.Types.ObjectId],
            ref: "Street",
            default: [],
        },
        eligibleNeighborhoodIds: {
            type: [Schema.Types.ObjectId],
            ref: "Neighborhood",
            default: [],
        },
        eligibleBusinessTypeIds: {
            type: [Schema.Types.ObjectId],
            ref: "BusinessType",
            default: [],
        },
        eligibleAll: { type: Boolean, default: true },
        resultSummary: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        coEditorUserIds: {
            type: [Schema.Types.ObjectId],
            ref: "User",
            default: [],
        },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Survey as Model<ISurvey>) ||
    mongoose.model<ISurvey>("Survey", SurveySchema);
