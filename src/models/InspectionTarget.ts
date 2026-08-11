import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    INSPECTION_RESULT_STATUS,
    INSPECTION_SELF_DECLARATION_STATUS,
    type InspectionResultStatus,
    type InspectionSelfDeclarationStatus,
} from "@/types";

export interface IInspectionTarget extends Document {
    campaignId: mongoose.Types.ObjectId;
    houseId: mongoose.Types.ObjectId;
    neighborhoodId: mongoose.Types.ObjectId;
    assignedCollaboratorUserId?: mongoose.Types.ObjectId;
    selfDeclarationStatus: InspectionSelfDeclarationStatus;
    resultStatus: InspectionResultStatus;
    selfDeclarationSentAt?: Date;
    openedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const InspectionTargetSchema = new Schema<IInspectionTarget>(
    {
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: "InspectionCampaign",
            required: true,
            index: true,
        },
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            required: true,
            index: true,
        },
        assignedCollaboratorUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        selfDeclarationStatus: {
            type: String,
            enum: INSPECTION_SELF_DECLARATION_STATUS,
            default: "NOT_SENT",
            index: true,
        },
        resultStatus: {
            type: String,
            enum: INSPECTION_RESULT_STATUS,
            default: "PENDING",
            index: true,
        },
        selfDeclarationSentAt: { type: Date },
        openedAt: { type: Date },
    },
    { timestamps: true },
);

InspectionTargetSchema.index({ campaignId: 1, houseId: 1 }, { unique: true });
InspectionTargetSchema.index({ campaignId: 1, neighborhoodId: 1, resultStatus: 1 });

export default (mongoose.models.InspectionTarget as Model<IInspectionTarget>) ||
    mongoose.model<IInspectionTarget>("InspectionTarget", InspectionTargetSchema);
