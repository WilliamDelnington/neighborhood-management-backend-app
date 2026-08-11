import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    INSPECTION_CAMPAIGN_STATUS,
    INSPECTION_CHECKLIST_INPUT_TYPE,
    type InspectionCampaignStatus,
    type InspectionChecklistItem,
} from "@/types";

export interface IInspectionCampaign extends Document {
    name: string;
    purpose: string;
    checklistTemplate: InspectionChecklistItem[];
    allowSelfDeclaration: boolean;
    requiredEvidence: boolean;
    startAt: Date;
    dueAt: Date;
    status: InspectionCampaignStatus;
    createdByWardUserId: mongoose.Types.ObjectId;
    neighborhoodSubmissions: Array<{
        neighborhoodId: mongoose.Types.ObjectId;
        submittedByUserId: mongoose.Types.ObjectId;
        submittedAt: Date;
        summary: Record<string, number>;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

const ChecklistItemSchema = new Schema<InspectionChecklistItem>(
    {
        itemId: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        inputType: {
            type: String,
            enum: INSPECTION_CHECKLIST_INPUT_TYPE,
            required: true,
        },
        required: { type: Boolean, default: false },
        options: { type: [String], default: undefined },
    },
    { _id: false },
);

const NeighborhoodSubmissionSchema = new Schema(
    {
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            required: true,
        },
        submittedByUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        submittedAt: { type: Date, required: true },
        summary: { type: Schema.Types.Mixed, required: true },
    },
    { _id: false },
);

const InspectionCampaignSchema = new Schema<IInspectionCampaign>(
    {
        name: { type: String, required: true, trim: true },
        purpose: { type: String, required: true, trim: true },
        checklistTemplate: { type: [ChecklistItemSchema], default: [] },
        allowSelfDeclaration: { type: Boolean, default: false },
        requiredEvidence: { type: Boolean, default: false },
        startAt: { type: Date, required: true, index: true },
        dueAt: { type: Date, required: true, index: true },
        status: {
            type: String,
            enum: INSPECTION_CAMPAIGN_STATUS,
            default: "DRAFT",
            index: true,
        },
        createdByWardUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        neighborhoodSubmissions: {
            type: [NeighborhoodSubmissionSchema],
            default: [],
        },
    },
    { timestamps: true },
);

InspectionCampaignSchema.index({ status: 1, dueAt: 1 });

export default (mongoose.models.InspectionCampaign as Model<IInspectionCampaign>) ||
    mongoose.model<IInspectionCampaign>("InspectionCampaign", InspectionCampaignSchema);
