import mongoose, { Schema, type Document, type Model } from "mongoose";
import { ROLES, USER_STATUS, type Role, type UserStatus } from "@/types";

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
    assignedClusters: string[];
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
        roles: { type: [String], enum: ROLES, default: ["resident"] },
        primaryRole: { type: String, enum: ROLES, default: "resident" },
        status: { type: String, enum: USER_STATUS, default: "active" },
        householdId: { type: Schema.Types.ObjectId, ref: "Household" },
        citizenId: { type: Schema.Types.ObjectId, ref: "Citizen" },
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
