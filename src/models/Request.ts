import mongoose, { Schema, type Document, type Model } from "mongoose";
import { REQUEST_TYPES, type RequestType } from "@/types";

export interface IRequest extends Document {
    type: RequestType;
    title: string;
    description?: string;
    note?: string;
    relatedModel?: string;
    relatedId?: mongoose.Types.ObjectId;
    houseId?: mongoose.Types.ObjectId;
    dueDate?: Date;
    targetRoles: string[];
    targetClusters: string[];
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const RequestSchema = new Schema<IRequest>(
    {
        type: { type: String, enum: REQUEST_TYPES, required: true, index: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        note: { type: String, trim: true },
        relatedModel: { type: String },
        relatedId: { type: Schema.Types.ObjectId },
        houseId: { type: Schema.Types.ObjectId, ref: "House", index: true },
        dueDate: { type: Date, index: true },
        targetRoles: { type: [String], default: [] },
        targetClusters: { type: [String], default: [] },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

RequestSchema.index({ relatedModel: 1, relatedId: 1 });

export default (mongoose.models.Request as Model<IRequest>) ||
    mongoose.model<IRequest>("Request", RequestSchema);
