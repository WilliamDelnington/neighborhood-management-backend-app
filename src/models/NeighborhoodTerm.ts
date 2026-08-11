import mongoose, { Schema, type Document, type Model } from "mongoose";

export const NEIGHBORHOOD_TERM_STATUSES = [
    "PLANNED",
    "ACTIVE",
    "ENDED",
    "CANCELLED",
] as const;
export type NeighborhoodTermStatus =
    (typeof NEIGHBORHOOD_TERM_STATUSES)[number];

export interface INeighborhoodTerm extends Document {
    neighborhoodId: mongoose.Types.ObjectId;
    name: string;
    startAt: Date;
    endAt: Date;
    status: NeighborhoodTermStatus;
    notes?: string;
    createdBy: mongoose.Types.ObjectId;
    updatedBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const NeighborhoodTermSchema = new Schema<INeighborhoodTerm>(
    {
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            required: true,
            index: true,
        },
        name: { type: String, required: true, trim: true },
        startAt: { type: Date, required: true, index: true },
        endAt: { type: Date, required: true, index: true },
        status: {
            type: String,
            enum: NEIGHBORHOOD_TERM_STATUSES,
            default: "PLANNED",
            index: true,
        },
        notes: { type: String, trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true },
);

NeighborhoodTermSchema.index({ neighborhoodId: 1, name: 1 }, { unique: true });
NeighborhoodTermSchema.index(
    { neighborhoodId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "ACTIVE" } },
);

export default (mongoose.models.NeighborhoodTerm as Model<INeighborhoodTerm>) ||
    mongoose.model<INeighborhoodTerm>("NeighborhoodTerm", NeighborhoodTermSchema);
