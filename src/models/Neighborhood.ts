import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface INeighborhood extends Document {
    name: string;
    code: string;
    sequence: number;
    active: boolean;
    address?: string;
    description?: string;
    contactPhone?: string;
    notes?: string;
    leaderUserId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const NeighborhoodSchema = new Schema<INeighborhood>(
    {
        name: { type: String, required: true, trim: true },
        code: { type: String, required: true, unique: true, index: true, trim: true },
        sequence: { type: Number, required: true, unique: true, index: true },
        active: { type: Boolean, default: true, index: true },
        address: { type: String, trim: true },
        description: { type: String, trim: true },
        contactPhone: { type: String, trim: true },
        notes: { type: String },
        leaderUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Neighborhood as Model<INeighborhood>) ||
    mongoose.model<INeighborhood>("Neighborhood", NeighborhoodSchema);
