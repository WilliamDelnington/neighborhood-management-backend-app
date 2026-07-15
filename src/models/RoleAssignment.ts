import mongoose, { Schema, type Document, type Model } from "mongoose";
import { SCOPE_TYPES, type Role, type ScopeType } from "@/types";

export interface IRoleAssignment extends Document {
    userId: mongoose.Types.ObjectId;
    role: Role;
    scopeType: ScopeType;
    scopeValues: string[];
    grantedBy: mongoose.Types.ObjectId;
    grantedAt: Date;
    revokedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const RoleAssignmentSchema = new Schema<IRoleAssignment>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        role: { type: String, required: true },
        scopeType: { type: String, enum: SCOPE_TYPES, default: "all" },
        scopeValues: { type: [String], default: [] },
        grantedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        grantedAt: { type: Date, default: Date.now },
        revokedAt: { type: Date },
    },
    { timestamps: true },
);

RoleAssignmentSchema.index({ userId: 1, role: 1, revokedAt: 1 });

export default (mongoose.models.RoleAssignment as Model<IRoleAssignment>) ||
    mongoose.model<IRoleAssignment>("RoleAssignment", RoleAssignmentSchema);
