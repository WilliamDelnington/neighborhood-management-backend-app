import mongoose, { Schema, type Document, type Model } from "mongoose";

export const REQUEST_FORM_FIELD_TYPES = [
    "text",
    "long_text",
    "number",
    "date",
    "boolean",
    "single_select",
    "multi_select",
] as const;
export type RequestFormFieldType = typeof REQUEST_FORM_FIELD_TYPES[number];

export interface IRequestFormField {
    key: string;
    label: string;
    type: RequestFormFieldType;
    required: boolean;
    options: string[];
    classification: "internal" | "personal" | "sensitive";
}

export interface IRequestTypeDefinition extends Document {
    key: string;
    name: string;
    description?: string;
    fields: IRequestFormField[];
    allowedSenderRoles: string[];
    allowedReceiverRoles: string[];
    dataEntryMode: "sender" | "recipient";
    version: number;
    active: boolean;
    wardCode?: number;
    wardName?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const RequestFormFieldSchema = new Schema<IRequestFormField>(
    {
        key: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        type: {
            type: String,
            enum: REQUEST_FORM_FIELD_TYPES,
            required: true,
        },
        required: { type: Boolean, default: false },
        options: { type: [String], default: [] },
        classification: {
            type: String,
            enum: ["internal", "personal", "sensitive"],
            default: "internal",
        },
    },
    { _id: false },
);

const RequestTypeDefinitionSchema = new Schema<IRequestTypeDefinition>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        fields: { type: [RequestFormFieldSchema], default: [] },
        allowedSenderRoles: { type: [String], default: [] },
        allowedReceiverRoles: { type: [String], default: [] },
        dataEntryMode: {
            type: String,
            enum: ["sender", "recipient"],
            default: "recipient",
        },
        version: { type: Number, default: 1, min: 1 },
        active: { type: Boolean, default: true, index: true },
        wardCode: { type: Number, index: true },
        wardName: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

RequestTypeDefinitionSchema.index({ wardCode: 1, active: 1, name: 1 });

export default (mongoose.models.RequestTypeDefinition as Model<IRequestTypeDefinition>) ||
    mongoose.model<IRequestTypeDefinition>(
        "RequestTypeDefinition",
        RequestTypeDefinitionSchema,
    );

