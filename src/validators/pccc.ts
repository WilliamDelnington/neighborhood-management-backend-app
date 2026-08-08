import { z } from "zod";
import { MUC_NGUY_CO_PCCC, TINH_TRANG_THEO_DOI_PCCC } from "@/types";

export const createPcccCheckSchema = z.object({
    houseId: z.string().min(1, "Thieu ma nha"),
    hasFireExtinguisher: z.boolean().default(false),
    hasEmergencyExit: z.boolean().default(false),
    hasIndoorEvCharging: z.boolean().default(false),
    hasGasStoveOrStorageOrBusiness: z.boolean().default(false),
    isCrowdedRental: z.boolean().default(false),
    riskLevel: z.enum(MUC_NGUY_CO_PCCC).default("xanh"),
    remediationNeeded: z.string().optional(),
    note: z.string().optional(),
    inspectionDate: z
        .string()
        .datetime({ message: "Ngay kiem tra khong hop le" }),
    inspectorId: z.string().optional(),
    followUpStatus: z.enum(TINH_TRANG_THEO_DOI_PCCC).default("chua_khac_phuc"),
});
export type CreatePcccCheckInput = z.infer<typeof createPcccCheckSchema>;

export const updatePcccCheckSchema = createPcccCheckSchema.partial();
export type UpdatePcccCheckInput = z.infer<typeof updatePcccCheckSchema>;
