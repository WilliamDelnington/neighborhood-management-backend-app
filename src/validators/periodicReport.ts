import { z } from "zod";
import { PERIODIC_REPORT_TYPES } from "@/types";

const sectionsSchema = z.object({
    generalSituation: z.string().max(20_000).optional(),
    highlights: z.string().max(20_000).optional(),
    recommendations: z.string().max(20_000).optional(),
    proposals: z.string().max(20_000).optional(),
});

const periodicReportInputSchema = z.object({
        type: z.enum(PERIODIC_REPORT_TYPES),
        periodStart: z.string().datetime(),
        periodEnd: z.string().datetime(),
        neighborhoodId: z.string().optional(),
        sections: sectionsSchema.default({}),
        submittedToUserId: z.string().optional(),
    });

export const createPeriodicReportSchema = periodicReportInputSchema
    .refine(value => new Date(value.periodStart) <= new Date(value.periodEnd), {
        message: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc",
        path: ["periodEnd"],
    });
export type CreatePeriodicReportInput = z.infer<
    typeof createPeriodicReportSchema
>;

export const updatePeriodicReportSchema = periodicReportInputSchema.partial();
export type UpdatePeriodicReportInput = z.infer<
    typeof updatePeriodicReportSchema
>;

export const requestPeriodicReportRevisionSchema = z.object({
    note: z.string().trim().min(1, "Vui lòng nhập lý do yêu cầu bổ sung").max(5_000),
});
export type RequestPeriodicReportRevisionInput = z.infer<
    typeof requestPeriodicReportRevisionSchema
>;
