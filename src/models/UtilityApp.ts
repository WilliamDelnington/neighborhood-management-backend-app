import mongoose, { Schema, type Document, type Model } from "mongoose";

// Mot muc trong "Nhom tien ich" (Quan ly dich vu) - lien ket toi mot app/dich
// vu ngoai (vd cac app sibling trong neighborhood-management-hub) hien thi
// duoi dang shortcut icon+ten tren trang chu resident-web-app. icon la URL anh
// (khong dung icon-key rieng vi 2 frontend dung 2 bo UI khac nhau - URL anh la
// cach render giong het nhau o ca hai noi bang mot the <img> don gian).
export interface IUtilityApp extends Document {
    name: string;
    icon: string;
    url: string;
    active: boolean;
    sortOrder: number;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const UtilityAppSchema = new Schema<IUtilityApp>(
    {
        name: { type: String, required: true, trim: true },
        icon: { type: String, required: true, trim: true },
        url: { type: String, required: true, trim: true },
        active: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

UtilityAppSchema.index({ active: 1, sortOrder: 1, name: 1 });

export default (mongoose.models.UtilityApp as Model<IUtilityApp>) ||
    mongoose.model<IUtilityApp>("UtilityApp", UtilityAppSchema);
