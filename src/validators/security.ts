import { z } from "zod";
import { LOAI_SO_HUU, MUC_DO_AN_NINH } from "@/types";

export const createSecurityRecordSchema = z.object({
    householdId: z.string().min(1, "Thieu ma ho dan"),
    ownershipType: z.enum(LOAI_SO_HUU).default("chinh_chu"),
    renterCount: z.number().int().min(0).default(0),
    temporaryResidenceDeclared: z.boolean().default(false),
    hasCamera: z.boolean().default(false),
    hasSecurityComplaint: z.boolean().default(false),
    level: z.enum(MUC_DO_AN_NINH).default("binh_thuong"),
    reportedToPolice: z.boolean().default(false),
    handlingStatus: z.string().optional(),
    note: z.string().optional(),
});
export type CreateSecurityRecordInput = z.infer<
    typeof createSecurityRecordSchema
>;

export const updateSecurityRecordSchema = createSecurityRecordSchema.partial();
export type UpdateSecurityRecordInput = z.infer<
    typeof updateSecurityRecordSchema
>;
