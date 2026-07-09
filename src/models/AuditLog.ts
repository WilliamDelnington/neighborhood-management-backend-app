import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IAuditLog extends Document {
    actorId?: mongoose.Types.ObjectId;
    action: string;
    targetModel?: string;
    targetId?: mongoose.Types.ObjectId;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
    {
        actorId: { type: Schema.Types.ObjectId, ref: "User" },
        action: { type: String, required: true, index: true },
        targetModel: { type: String },
        targetId: { type: Schema.Types.ObjectId },
        metadata: { type: Schema.Types.Mixed },
        ipAddress: { type: String },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ createdAt: -1 });

export default (mongoose.models.AuditLog as Model<IAuditLog>) ||
    mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
