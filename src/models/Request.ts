import mongoose, { Schema, type Document, type Model } from "mongoose";
import { REQUEST_PRIORITIES, type RequestPriority, type RequestType } from "@/types";
import type { IRequestFormField } from "@/models/RequestTypeDefinition";

export interface IRequest extends Document {
    type: RequestType;
    typeDefinitionId?: mongoose.Types.ObjectId;
    formSchemaVersion?: number;
    formDefinitionSnapshot?: {
        name: string;
        dataEntryMode: "sender" | "recipient";
        fields: IRequestFormField[];
    };
    formDataEncrypted?: string;
    formDataUpdatedAt?: Date;
    formDataUpdatedBy?: mongoose.Types.ObjectId;
    title: string;
    description?: string;
    note?: string;
    priority: RequestPriority;
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
        type: { type: String, required: true, index: true, trim: true },
        typeDefinitionId: {
            type: Schema.Types.ObjectId,
            ref: "RequestTypeDefinition",
            index: true,
        },
        formSchemaVersion: { type: Number, min: 1 },
        // Snapshot bat bien de yeu cau cu van hien/validate dung schema tai
        // thoi diem giao viec, ke ca khi danh muc loai nhiem vu tang version.
        formDefinitionSnapshot: { type: Schema.Types.Mixed },
        // Toan bo payload bieu mau duoc ma hoa AES-256-GCM. `select: false`
        // ngan ro ri vo tinh qua cac truy van khong can noi dung chi tiet.
        formDataEncrypted: { type: String, select: false },
        formDataUpdatedAt: { type: Date },
        formDataUpdatedBy: { type: Schema.Types.ObjectId, ref: "User" },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        note: { type: String, trim: true },
        priority: {
            type: String,
            enum: REQUEST_PRIORITIES,
            default: "normal",
            index: true,
        },
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
