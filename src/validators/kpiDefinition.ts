import { z } from "zod";
import {
    KPI_DATA_SOURCES,
    KPI_FORMULA_TYPES,
    KPI_PERIODS,
    KPI_TARGET_DIRECTIONS,
} from "@/types";

export const createKpiDefinitionSchema = z.object({
    code: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/^[a-z][a-z0-9_]*$/, "Ma KPI chi gom chu thuong, so va dau gach duoi"),
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2_000).optional(),
    formulaType: z.enum(KPI_FORMULA_TYPES),
    dataSource: z.enum(KPI_DATA_SOURCES),
    targetValue: z.number().finite().min(0),
    targetDirection: z.enum(KPI_TARGET_DIRECTIONS).default("gte"),
    unit: z.string().trim().min(1).max(20).default("%"),
    period: z.enum(KPI_PERIODS),
    active: z.boolean().default(true),
});

export const updateKpiDefinitionSchema = createKpiDefinitionSchema
    .omit({ code: true })
    .partial();

export type CreateKpiDefinitionInput = z.infer<typeof createKpiDefinitionSchema>;
export type UpdateKpiDefinitionInput = z.infer<typeof updateKpiDefinitionSchema>;
