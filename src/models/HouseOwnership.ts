import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    OWNER_TYPE,
    HOUSE_OWNERSHIP_RELATIONSHIP_TYPES,
    HOUSE_OWNERSHIP_VERIFICATION_STATUS,
    type OwnerType,
    type HouseOwnershipRelationshipType,
    type HouseOwnershipVerificationStatus,
} from "@/types";

/**
 * Quan he so huu/quan ly giua mot House va mot chu nha (User) hoac to chuc
 * (Organization) - nguon "su that" cho quan he nhieu-nhieu House<->chu nha
 * (mot nha co the co dong thoi primary_owner + co_owner + authorized_manager,
 * mot nguoi/to chuc co the so huu nhieu nha). HouseRecord.ownerId/ownerType
 * van duoc giu lai nhu mot cache cua ban ghi primary_owner dang active (xem
 * houseOwnershipService.syncPrimaryOwnerCache) de cac cho populate/doc nhanh
 * (frontend, businessService...) khong phai doi ngay.
 * Chuyen nhuong/thu hoi KHONG ghi de ban ghi cu: ket thuc (active=false,
 * endDate, reason) roi tao ban ghi moi, giu nguyen lich su.
 */
export interface IHouseOwnership extends Document {
    houseId: mongoose.Types.ObjectId;
    ownerType: OwnerType;
    ownerId: mongoose.Types.ObjectId;
    relationshipType: HouseOwnershipRelationshipType;
    startDate: Date;
    endDate?: Date;
    active: boolean;
    verificationStatus: HouseOwnershipVerificationStatus;
    reason?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const HouseOwnershipSchema = new Schema<IHouseOwnership>(
    {
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        // ownerId tro toi User (ownerType="user") hoac Organization
        // (ownerType="organization"), resolve thu cong o service layer - giong
        // pattern da dung o HouseRecord.ownerId/ownerType.
        ownerType: { type: String, enum: OWNER_TYPE, required: true },
        ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
        relationshipType: {
            type: String,
            enum: HOUSE_OWNERSHIP_RELATIONSHIP_TYPES,
            required: true,
        },
        startDate: { type: Date, required: true, default: Date.now },
        endDate: { type: Date },
        active: { type: Boolean, default: true, index: true },
        verificationStatus: {
            type: String,
            enum: HOUSE_OWNERSHIP_VERIFICATION_STATUS,
            default: "waiting_verification",
        },
        reason: { type: String, trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

HouseOwnershipSchema.index({ houseId: 1, active: 1 });
HouseOwnershipSchema.index({ ownerType: 1, ownerId: 1, active: 1 });
// Chi cho phep mot ban ghi primary_owner active tai mot thoi diem cho moi nha
// (chuyen nhuong phai ket thuc ban ghi cu truoc khi tao ban ghi moi) - co_owner/
// authorized_manager/... khong bi rang buoc nay, co the co nhieu ban ghi active
// dong thoi.
HouseOwnershipSchema.index(
    { houseId: 1, relationshipType: 1 },
    {
        unique: true,
        partialFilterExpression: {
            active: true,
            relationshipType: "primary_owner",
        },
    },
);

export default (mongoose.models.HouseOwnership as Model<IHouseOwnership>) ||
    mongoose.model<IHouseOwnership>("HouseOwnership", HouseOwnershipSchema);
