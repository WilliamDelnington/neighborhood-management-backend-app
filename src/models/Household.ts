import mongoose, { Schema, type Document, type Model } from "mongoose";
import { LOAI_SO_HUU, type LoaiSoHuu } from "@/types";

export interface IHousehold extends Document {
    code: string;
    cluster: string;
    streetId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    address: string;
    headOfHousehold: string;
    headOfHouseholdUserId?: mongoose.Types.ObjectId;
    phone?: string;
    memberCount: number;
    ownershipType: LoaiSoHuu;
    needsSupport: boolean;
    houseId?: mongoose.Types.ObjectId;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const HouseholdSchema = new Schema<IHousehold>(
    {
        code: { type: String, required: true, unique: true, index: true },
        cluster: { type: String, required: true, index: true },
        // Chuan hoa cua `cluster` (xem src/lib/streetSync.ts) - duoc dong bo
        // tu dong, khong nhap tay truc tiep qua form cu.
        streetId: { type: Schema.Types.ObjectId, ref: "Street", index: true },
        // Suy tu HouseRecord.neighborhoodId cua houseId luc tao (xem
        // householdService.ts) - HouseRecord.neighborhoodId duoc admin gan thu
        // cong nen truong nay co the con trong voi nha chua duoc gan.
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        address: { type: String, required: true },
        headOfHousehold: { type: String, required: true },
        // Lien ket toi tai khoan thuc su cua chu ho (phai co role house_owner) -
        // headOfHousehold (text) van giu de hien thi cho ho chua co tai khoan.
        headOfHouseholdUserId: { type: Schema.Types.ObjectId, ref: "User" },
        phone: { type: String, trim: true },
        memberCount: { type: Number, default: 0 },
        ownershipType: {
            type: String,
            enum: LOAI_SO_HUU,
            default: "chinh_chu",
        },
        needsSupport: { type: Boolean, default: false },
        houseId: { type: Schema.Types.ObjectId, ref: "House", index: true },
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

HouseholdSchema.index({ address: "text", headOfHousehold: "text" });

export default (mongoose.models.Household as Model<IHousehold>) ||
    mongoose.model<IHousehold>("Household", HouseholdSchema);
