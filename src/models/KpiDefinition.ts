import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    KPI_DATA_SOURCES,
    KPI_FORMULA_TYPES,
    KPI_PERIODS,
    KPI_TARGET_DIRECTIONS,
    type KpiDataSource,
    type KpiFormulaType,
    type KpiPeriod,
    type KpiTargetDirection,
} from "@/types";

export interface IKpiDefinition extends Document {
    code: string;
    name: string;
    description?: string;
    formulaType: KpiFormulaType;
    dataSource: KpiDataSource;
    targetValue: number;
    targetDirection: KpiTargetDirection;
    unit: string;
    period: KpiPeriod;
    wardCode?: number;
    active: boolean;
    version: number;
    createdBy: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const KpiDefinitionSchema = new Schema<IKpiDefinition>(
    {
        code: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        formulaType: {
            type: String,
            enum: KPI_FORMULA_TYPES,
            default: "ratio",
        },
        dataSource: { type: String, enum: KPI_DATA_SOURCES, required: true },
        targetValue: { type: Number, required: true },
        targetDirection: {
            type: String,
            enum: KPI_TARGET_DIRECTIONS,
            default: "gte",
        },
        unit: { type: String, default: "%", trim: true },
        period: { type: String, enum: KPI_PERIODS, required: true },
        wardCode: { type: Number, index: true },
        active: { type: Boolean, default: true, index: true },
        version: { type: Number, default: 1, min: 1 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

KpiDefinitionSchema.index({ wardCode: 1, code: 1 }, { unique: true });

export default (mongoose.models.KpiDefinition as Model<IKpiDefinition>) ||
    mongoose.model<IKpiDefinition>("KpiDefinition", KpiDefinitionSchema);
