import mongoose, { Schema, type Document, type Model } from "mongoose";
import { ORGANIZATION_TYPE, type OrganizationType } from "@/types";

export interface IOrganization extends Document {
    name: string;
    taxCode: string;
    organizationType: OrganizationType;
    // Nguoi dai dien - tai khoan User (vai tro house_owner) thuc su dang nhap
    // va thao tac thay cho to chuc (to chuc khong tu dang nhap duoc, xem
    // authService.ts - dang nhap chi ho tro User). Optional: to chuc duoc khai
    // bao luc tao nha so co the chua co nguoi dai dien nao dang nhap duoc (xem
    // houseRecordService.resolveOrCreateOrganizationOwner) - khi do to chuc
    // chi hien thi thong tin lien he (phone/email/address) cua chinh no, khong
    // co ai "thao tac thay" (resolveActingUserId tra ve undefined).
    representativeUserId?: mongoose.Types.ObjectId;
    representativeRole?: string;
    phone?: string;
    email?: string;
    address?: string;
    active: boolean;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
    {
        name: { type: String, required: true, trim: true, index: true },
        taxCode: { type: String, required: true, unique: true, trim: true },
        organizationType: {
            type: String,
            enum: ORGANIZATION_TYPE,
            default: "khac",
        },
        representativeUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        representativeRole: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true },
        address: { type: String, trim: true },
        active: { type: Boolean, default: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Organization as Model<IOrganization>) ||
    mongoose.model<IOrganization>("Organization", OrganizationSchema);
