import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IStreet extends Document {
    name: string;
    code: string;
    active: boolean;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const StreetSchema = new Schema<IStreet>(
    {
        name: { type: String, required: true, trim: true, index: true },
        code: { type: String, required: true, unique: true, index: true, trim: true },
        active: { type: Boolean, default: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Street as Model<IStreet>) ||
    mongoose.model<IStreet>("Street", StreetSchema);
