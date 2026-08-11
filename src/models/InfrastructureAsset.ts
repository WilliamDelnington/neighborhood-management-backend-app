import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    INFRASTRUCTURE_ASSET_TYPES,
    INFRASTRUCTURE_ASSET_CONDITIONS,
    type InfrastructureAssetType,
    type InfrastructureAssetCondition,
} from "@/types";

// So ha tang cua To dan pho (B11) - PCCC/an ninh KHONG nam trong day, da co
// module rieng (PcccCheck/SecurityRecord). Day la tai san chung cua khu vuc
// (den/duong/cong/cay/diem rac/nha sinh hoat), khong gan voi mot Nha so cu
// the - khac Complaint (mot lan bao/su co) o cho day la MASTER DATA ton tai
// lau dai qua nhieu lan kiem tra/su co.
export interface IInfrastructureAsset extends Document {
    name: string;
    type: InfrastructureAssetType;
    neighborhoodId: mongoose.Types.ObjectId;
    location?: string;
    condition: InfrastructureAssetCondition;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const InfrastructureAssetSchema = new Schema<IInfrastructureAsset>(
    {
        name: { type: String, required: true, trim: true },
        type: {
            type: String,
            enum: INFRASTRUCTURE_ASSET_TYPES,
            required: true,
            index: true,
        },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            required: true,
            index: true,
        },
        location: { type: String, trim: true },
        condition: {
            type: String,
            enum: INFRASTRUCTURE_ASSET_CONDITIONS,
            default: "binh_thuong",
            index: true,
        },
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

InfrastructureAssetSchema.index({ name: "text" });

export default (mongoose.models
    .InfrastructureAsset as Model<IInfrastructureAsset>) ||
    mongoose.model<IInfrastructureAsset>(
        "InfrastructureAsset",
        InfrastructureAssetSchema,
    );
