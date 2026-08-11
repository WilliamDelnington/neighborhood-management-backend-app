import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface INeighborhoodHistory extends Document {
    neighborhoodId: mongoose.Types.ObjectId;
    action: string;
    actorId: mongoose.Types.ObjectId;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    createdAt: Date;
}

const NeighborhoodHistorySchema = new Schema<INeighborhoodHistory>(
    {
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            required: true,
            index: true,
        },
        action: { type: String, required: true, index: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        before: { type: Schema.Types.Mixed },
        after: { type: Schema.Types.Mixed },
        metadata: { type: Schema.Types.Mixed },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

NeighborhoodHistorySchema.index({ neighborhoodId: 1, createdAt: -1 });

export default (mongoose.models.NeighborhoodHistory as Model<INeighborhoodHistory>) ||
    mongoose.model<INeighborhoodHistory>(
        "NeighborhoodHistory",
        NeighborhoodHistorySchema,
    );
