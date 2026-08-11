import mongoose, { Schema, type Document, type Model } from "mongoose";
import { USER_STATUS, type Role, type UserStatus } from "@/types";

export interface IUser extends Document {
    zaloUserId?: string;
    zaloAppUserId?: string;
    displayName: string;
    avatarUrl?: string;
    phone?: string;
    email?: string;
    address?: string;
    passwordHash?: string;
    roles: Role[];
    primaryRole: Role;
    status: UserStatus;
    householdId?: mongoose.Types.ObjectId;
    citizenId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    assignedNeighborhoodIds: mongoose.Types.ObjectId[];
    assignedClusters: string[];
    // Pham vi phuong/xa cho people_committee_official va secretary - cung
    // dang denormalized nhu Neighborhood.wardCode/wardName (nguon du lieu tu
    // https://provinces.open-api.vn, khong co collection Ward/Province rieng).
    // Dung boi wardScopeFilter (rbac.ts) de loc To dan pho/nguoi dung thuoc
    // phuong/xa nay khi PCO gui Cong Van.
    provinceCode?: number;
    provinceName?: string;
    wardCode?: number;
    wardName?: string;
    permissions: string[];
    lastLoginAt?: Date;
    notificationPermission: boolean;
    sessionVersion: number;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        zaloUserId: { type: String, unique: true, sparse: true, index: true },
        zaloAppUserId: { type: String },
        displayName: { type: String, required: true, trim: true },
        avatarUrl: { type: String },
        phone: { type: String, trim: true, unique: true, sparse: true },
        email: { type: String, trim: true },
        address: { type: String, trim: true },
        passwordHash: { type: String, select: false },
        // Vai tro la du lieu dong (bang Role), khong con enum tinh - tinh hop le
        // (ton tai, active) duoc kiem tra o service layer (assignRole).
        roles: { type: [String], default: ["house_owner"] },
        primaryRole: { type: String, default: "house_owner" },
        status: { type: String, enum: USER_STATUS, default: "active" },
        householdId: { type: Schema.Types.ObjectId, ref: "Household" },
        citizenId: { type: Schema.Types.ObjectId, ref: "Citizen" },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        assignedNeighborhoodIds: {
            type: [Schema.Types.ObjectId],
            ref: "Neighborhood",
            default: [],
        },
        provinceCode: { type: Number },
        provinceName: { type: String },
        // Ma hanh chinh dong vai tro ward ID cho den khi he thong co Ward
        // collection noi bo; khong tao them wardId song song de tranh lech.
        wardCode: { type: Number, index: true },
        wardName: { type: String },
        // Truong tam thoi (transitional) - cum dan cu dang dang du lieu tu do,
        // giu lai de tuong thich nguoc cho den khi du lieu duoc migrate day du
        // sang Neighborhood (xem Neighborhood.ts / neighborhoodService.ts).
        assignedClusters: { type: [String], default: [] },
        permissions: { type: [String], default: [] },
        lastLoginAt: { type: Date },
        notificationPermission: { type: Boolean, default: false },
        sessionVersion: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

UserSchema.index({ displayName: "text", phone: "text" });

export default (mongoose.models.User as Model<IUser>) ||
    mongoose.model<IUser>("User", UserSchema);
