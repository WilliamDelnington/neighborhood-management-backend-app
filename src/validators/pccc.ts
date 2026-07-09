import { z } from "zod";
import { MUC_NGUY_CO_PCCC } from "@/types";

export const createPcccCheckSchema = z.object({
    householdId: z.string().min(1, "Thieu ma ho dan"),
    hasFireExtinguisher: z.boolean().default(false),
    hasEmergencyExit: z.boolean().default(false),
    hasIndoorEvCharging: z.boolean().default(false),
    hasGasStoveOrStorageOrBusiness: z.boolean().default(false),
    isCrowdedRental: z.boolean().default(false),
    riskLevel: z.enum(MUC_NGUY_CO_PCCC).default("xanh"),
    remediationNeeded: z.string().optional(),
    inspectionDate: z
        .string()
        .datetime({ message: "Ngay kiem tra khong hop le" }),
    inspectorId: z.string().optional(),
    followUpStatus: z.string().optional(),
});
export type CreatePcccCheckInput = z.infer<typeof createPcccCheckSchema>;

export const updatePcccCheckSchema = createPcccCheckSchema.partial();
export type UpdatePcccCheckInput = z.infer<typeof updatePcccCheckSchema>;
