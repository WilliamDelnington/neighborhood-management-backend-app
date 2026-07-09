import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ISetting extends Document {
    key: string;
    value: unknown;
    description?: string;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
    {
        key: { type: String, required: true, unique: true },
        value: { type: Schema.Types.Mixed },
        description: { type: String },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Setting as Model<ISetting>) ||
    mongoose.model<ISetting>("Setting", SettingSchema);
