import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ISurveyAnswer {
    questionId: mongoose.Types.ObjectId;
    selectedOptions: string[];
    otherText?: string;
}

export interface ISurveyResponse extends Document {
    surveyId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    answers: ISurveyAnswer[];
    createdAt: Date;
    updatedAt: Date;
}

const SurveyAnswerSchema = new Schema<ISurveyAnswer>(
    {
        questionId: { type: Schema.Types.ObjectId, required: true },
        selectedOptions: { type: [String], default: [] },
        otherText: { type: String },
    },
    { _id: false },
);

const SurveyResponseSchema = new Schema<ISurveyResponse>(
    {
        surveyId: {
            type: Schema.Types.ObjectId,
            ref: "Survey",
            required: true,
        },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        answers: { type: [SurveyAnswerSchema], default: [] },
    },
    { timestamps: true },
);

SurveyResponseSchema.index({ surveyId: 1, userId: 1 }, { unique: true });

export default (mongoose.models.SurveyResponse as Model<ISurveyResponse>) ||
    mongoose.model<ISurveyResponse>("SurveyResponse", SurveyResponseSchema);
