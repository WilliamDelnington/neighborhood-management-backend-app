import { z } from "zod";
import { PERIODIC_REPORT_TYPES } from "@/types";

const sectionsSchema = z.object({
    generalSituation: z.string().optional(),
    highlights: z.string().optional(),
    recommendations: z.string().optional(),
    proposals: z.string().optional(),
});

export const createPeriodicReportSchema = z.object({
    type: z.enum(PERIODIC_REPORT_TYPES),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    neighborhoodId: z.string().optional(),
    sections: sectionsSchema.default({}),
    submittedToUserId: z.string().optional(),
});
export type CreatePeriodicReportInput = z.infer<
    typeof createPeriodicReportSchema
>;

export const updatePeriodicReportSchema = createPeriodicReportSchema.partial();
export type UpdatePeriodicReportInput = z.infer<
    typeof updatePeriodicReportSchema
>;

export const requestPeriodicReportRevisionSchema = z.object({
    note: z.string().min(1, "Vui long nhap ly do yeu cau bo sung"),
});
export type RequestPeriodicReportRevisionInput = z.infer<
    typeof requestPeriodicReportRevisionSchema
>;
