import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    ORGANIZATION_REPRESENTATIVE_ROLES,
    HOUSE_OWNERSHIP_VERIFICATION_STATUS,
    type OrganizationRepresentativeRole,
    type HouseOwnershipVerificationStatus,
} from "@/types";

/**
 * Quan he "dai dien cho" giua mot User va mot Organization - nguon "su that"
 * cho quan he nhieu-nhieu Organization<->nguoi dai dien (mot to chuc co the
 * co dong thoi mot legal_representative + nhieu authorized_manager, mot
 * nguoi co the dai dien cho nhieu to chuc). Organization.representativeUserId/
 * representativeRole van duoc giu lai nhu mot cache cua ban ghi
 * legal_representative dang active (xem
 * organizationRepresentativeService.syncPrimaryRepresentativeCache) de cac
 * cho populate/doc nhanh (frontend, houseOwnershipService...) khong phai join.
 * Thay doi nguoi dai dien KHONG ghi de ban ghi cu: ket thuc (active=false,
 * endDate, reason) roi tao ban ghi moi, giu nguyen lich su.
 */
export interface IOrganizationRepresentative extends Document {
    organizationId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    role: OrganizationRepresentativeRole;
    // Chuc danh tu do (vd "Giam doc", "Ke toan truong") - mo ta THEM cho role
    // (enum co dinh, quyet dinh quyen han), khong thay the role. Tuong duong
    // Organization.representativeRole cu (truoc khi tach bang nay).
    title?: string;
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

const OrganizationRepresentativeSchema = new Schema<IOrganizationRepresentative>(
    {
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        role: {
            type: String,
            enum: ORGANIZATION_REPRESENTATIVE_ROLES,
            required: true,
        },
        title: { type: String, trim: true },
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

OrganizationRepresentativeSchema.index({ organizationId: 1, active: 1 });
OrganizationRepresentativeSchema.index({ userId: 1, active: 1 });
// Chi cho phep mot ban ghi legal_representative active tai mot thoi diem cho
// moi to chuc (thay doi phai ket thuc ban ghi cu truoc khi tao ban ghi moi) -
// authorized_manager/contact_person khong bi rang buoc nay, co the co nhieu
// ban ghi active dong thoi.
OrganizationRepresentativeSchema.index(
    { organizationId: 1, role: 1 },
    {
        unique: true,
        partialFilterExpression: {
            active: true,
            role: "legal_representative",
        },
    },
);

export default (mongoose.models.OrganizationRepresentative as Model<IOrganizationRepresentative>) ||
    mongoose.model<IOrganizationRepresentative>(
        "OrganizationRepresentative",
        OrganizationRepresentativeSchema,
    );
