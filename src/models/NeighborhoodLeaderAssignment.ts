import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface INeighborhoodLeaderAssignment extends Document {
    neighborhoodId: mongoose.Types.ObjectId;
    leaderUserId: mongoose.Types.ObjectId;
    assignedBy: mongoose.Types.ObjectId;
    assignedAt: Date;
    unassignedAt?: Date;
    unassignedBy?: mongoose.Types.ObjectId;
    note?: string;
    createdAt: Date;
    updatedAt: Date;
}

const NeighborhoodLeaderAssignmentSchema =
    new Schema<INeighborhoodLeaderAssignment>(
        {
            neighborhoodId: {
                type: Schema.Types.ObjectId,
                ref: "Neighborhood",
                required: true,
                // Khong dat index:true rieng - da co index duy nhat (partial,
                // xem ben duoi) tren field nay roi.
            },
            leaderUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            assignedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            assignedAt: { type: Date, default: Date.now },
            unassignedAt: { type: Date },
            unassignedBy: { type: Schema.Types.ObjectId, ref: "User" },
            note: { type: String },
        },
        { timestamps: true },
    );

// Chi cho phep MOT ban ghi phan cong dang hoat dong (chua unassignedAt) tren
// moi to dan pho - dam bao khong the co 2 to truong active cung luc.
NeighborhoodLeaderAssignmentSchema.index(
    { neighborhoodId: 1 },
    { unique: true, partialFilterExpression: { unassignedAt: { $exists: false } } },
);

export default (mongoose.models.NeighborhoodLeaderAssignment as Model<INeighborhoodLeaderAssignment>) ||
    mongoose.model<INeighborhoodLeaderAssignment>(
        "NeighborhoodLeaderAssignment",
        NeighborhoodLeaderAssignmentSchema,
    );
