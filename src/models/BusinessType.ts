import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IBusinessType extends Document {
    name: string;
    description?: string;
    active: boolean;
    sortOrder: number;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const BusinessTypeSchema = new Schema<IBusinessType>(
    {
        name: { type: String, required: true, unique: true, trim: true },
        description: { type: String, trim: true },
        active: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

BusinessTypeSchema.index({ active: 1, sortOrder: 1, name: 1 });

export default (mongoose.models.BusinessType as Model<IBusinessType>) ||
    mongoose.model<IBusinessType>("BusinessType", BusinessTypeSchema);
