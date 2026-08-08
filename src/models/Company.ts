import mongoose, { Schema, type Document, type Model } from "mongoose";
import { VERIFICATION_STATUS, type VerificationStatus } from "@/types";

export interface ICompany extends Document {
    name: string;
    houseId: mongoose.Types.ObjectId;
    cluster: string;
    streetId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    ownerName?: string;
    phone?: string;
    active: boolean;
    // Trang thai xac thuc CUA CHINH cong ty nay - doc lap voi trang thai cua
    // nha so cha, giong Business/Household (xem VerificationStatus o
    // types/index.ts). Khac Business: khong co quy trinh nop/duyet giay to
    // rieng (BusinessDocument) - chuyen trang thai hoan toan thu cong qua
    // companyService.transitionCompanyStatus.
    status: VerificationStatus;
    approvalNote?: string;
    denialReason?: string;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
    {
        name: { type: String, required: true, trim: true },
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        cluster: { type: String, required: true, index: true },
        // Chuan hoa cua `cluster` (xem src/lib/streetSync.ts), sao chep tu
        // HouseRecord lien ket luc tao, giong cluster cua Business.
        streetId: { type: Schema.Types.ObjectId, ref: "Street", index: true },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        ownerName: { type: String, trim: true },
        phone: { type: String, trim: true },
        active: { type: Boolean, default: true },
        status: {
            type: String,
            enum: VERIFICATION_STATUS,
            default: "unverified",
            index: true,
        },
        approvalNote: { type: String },
        denialReason: { type: String },
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

CompanySchema.index({ name: "text" });

export default (mongoose.models.Company as Model<ICompany>) ||
    mongoose.model<ICompany>("Company", CompanySchema);
