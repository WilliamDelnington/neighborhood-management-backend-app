import mongoose, { Schema, type Document, type Model } from "mongoose";
import { LOAI_SO_HUU, type LoaiSoHuu } from "@/types";

export interface IResidentRecord extends Document {
    houseId: mongoose.Types.ObjectId;
    ownershipType: LoaiSoHuu;
    renterCount: number;
    inspectionDate: Date;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ResidentRecordSchema = new Schema<IResidentRecord>(
    {
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        ownershipType: {
            type: String,
            enum: LOAI_SO_HUU,
            default: "chinh_chu",
        },
        renterCount: { type: Number, default: 0 },
        // Khong danh dau required o schema: nhat quan voi SecurityRecord
        // truoc day - Zod (validators/resident.ts) moi bat buoc gia tri nay
        // khi TAO moi.
        inspectionDate: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.ResidentRecord as Model<IResidentRecord>) ||
    mongoose.model<IResidentRecord>("ResidentRecord", ResidentRecordSchema);
