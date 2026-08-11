import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IInspectionAnswer extends Document {
    resultId: mongoose.Types.ObjectId;
    checklistItemId: string;
    value: unknown;
    createdAt: Date;
    updatedAt: Date;
}

const InspectionAnswerSchema = new Schema<IInspectionAnswer>(
    {
        resultId: {
            type: Schema.Types.ObjectId,
            ref: "InspectionResult",
            required: true,
            index: true,
        },
        checklistItemId: { type: String, required: true, trim: true },
        value: { type: Schema.Types.Mixed },
    },
    { timestamps: true },
);

InspectionAnswerSchema.index(
    { resultId: 1, checklistItemId: 1 },
    { unique: true },
);

export default (mongoose.models.InspectionAnswer as Model<IInspectionAnswer>) ||
    mongoose.model<IInspectionAnswer>("InspectionAnswer", InspectionAnswerSchema);
