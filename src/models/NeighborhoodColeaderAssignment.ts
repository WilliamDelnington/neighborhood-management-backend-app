import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface INeighborhoodColeaderAssignment extends Document {
    neighborhoodId: mongoose.Types.ObjectId;
    coleaderUserId: mongoose.Types.ObjectId;
    assignedBy: mongoose.Types.ObjectId;
    assignedAt: Date;
    termId?: mongoose.Types.ObjectId;
    endAt?: Date;
    unassignedAt?: Date;
    unassignedBy?: mongoose.Types.ObjectId;
    note?: string;
    createdAt: Date;
    updatedAt: Date;
}

const NeighborhoodColeaderAssignmentSchema =
    new Schema<INeighborhoodColeaderAssignment>(
        {
            neighborhoodId: {
                type: Schema.Types.ObjectId,
                ref: "Neighborhood",
                required: true,
                index: true,
            },
            coleaderUserId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                // Khong dat index:true rieng - da co index duy nhat (partial,
                // xem ben duoi) tren field nay roi.
            },
            assignedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
            assignedAt: { type: Date, default: Date.now },
            termId: { type: Schema.Types.ObjectId, ref: "NeighborhoodTerm", index: true },
            endAt: { type: Date, index: true },
            unassignedAt: { type: Date },
            unassignedBy: { type: Schema.Types.ObjectId, ref: "User" },
            note: { type: String },
        },
        { timestamps: true },
    );

// Khong dat unique tren neighborhoodId nhu NeighborhoodLeaderAssignment - mot
// to dan pho co the co NHIEU to pho dang hoat dong cung luc (khac to truong,
// chi duoc 1 nguoi). Nhung mot nguoi khong duoc la to pho dang active o 2 to
// dan pho cung luc (giu don gian, giong chinh sach 1-to-truong-1-to).
NeighborhoodColeaderAssignmentSchema.index(
    { coleaderUserId: 1 },
    { unique: true, partialFilterExpression: { unassignedAt: { $exists: false } } },
);

export default (mongoose.models
    .NeighborhoodColeaderAssignment as Model<INeighborhoodColeaderAssignment>) ||
    mongoose.model<INeighborhoodColeaderAssignment>(
        "NeighborhoodColeaderAssignment",
        NeighborhoodColeaderAssignmentSchema,
    );
