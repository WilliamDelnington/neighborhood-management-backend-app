import mongoose, { Schema, type Document, type Model } from "mongoose";

export const NEIGHBORHOOD_COLLABORATOR_SCOPES = [
    "WHOLE_NEIGHBORHOOD",
    "STREET",
    "HOUSE_GROUP",
    "CAMPAIGN",
] as const;
export type NeighborhoodCollaboratorScope =
    (typeof NEIGHBORHOOD_COLLABORATOR_SCOPES)[number];

export interface INeighborhoodCollaboratorAssignment extends Document {
    neighborhoodId: mongoose.Types.ObjectId;
    collaboratorUserId: mongoose.Types.ObjectId;
    scopeType: NeighborhoodCollaboratorScope;
    streetId?: mongoose.Types.ObjectId;
    houseIds: mongoose.Types.ObjectId[];
    campaignId?: mongoose.Types.ObjectId;
    startAt: Date;
    endAt?: Date;
    assignedBy: mongoose.Types.ObjectId;
    unassignedAt?: Date;
    unassignedBy?: mongoose.Types.ObjectId;
    note?: string;
    createdAt: Date;
    updatedAt: Date;
}

const NeighborhoodCollaboratorAssignmentSchema =
    new Schema<INeighborhoodCollaboratorAssignment>(
        {
            neighborhoodId: {
                type: Schema.Types.ObjectId,
                ref: "Neighborhood",
                required: true,
                index: true,
            },
            collaboratorUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            scopeType: {
                type: String,
                enum: NEIGHBORHOOD_COLLABORATOR_SCOPES,
                required: true,
                index: true,
            },
            streetId: { type: Schema.Types.ObjectId, ref: "Street" },
            houseIds: [{ type: Schema.Types.ObjectId, ref: "HouseRecord" }],
            campaignId: {
                type: Schema.Types.ObjectId,
                ref: "InspectionCampaign",
            },
            startAt: { type: Date, default: Date.now },
            endAt: { type: Date, index: true },
            assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
            unassignedAt: { type: Date },
            unassignedBy: { type: Schema.Types.ObjectId, ref: "User" },
            note: { type: String, trim: true },
        },
        { timestamps: true },
    );

NeighborhoodCollaboratorAssignmentSchema.index({
    neighborhoodId: 1,
    collaboratorUserId: 1,
    unassignedAt: 1,
});

export default (mongoose.models
    .NeighborhoodCollaboratorAssignment as Model<INeighborhoodCollaboratorAssignment>) ||
    mongoose.model<INeighborhoodCollaboratorAssignment>(
        "NeighborhoodCollaboratorAssignment",
        NeighborhoodCollaboratorAssignmentSchema,
    );
