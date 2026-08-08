import { z } from "zod";
import { MUC_DO_AN_NINH, TINH_TRANG_THEO_DOI_AN_NINH } from "@/types";

export const createSecurityRecordSchema = z.object({
    houseId: z.string().min(1, "Thieu ma nha"),
    hasCamera: z.boolean().default(false),
    hasSecurityComplaint: z.boolean().default(false),
    level: z.enum(MUC_DO_AN_NINH).default("binh_thuong"),
    reportedToPolice: z.boolean().default(false),
    monitoringStatus: z.enum(TINH_TRANG_THEO_DOI_AN_NINH).default("binh_thuong"),
    note: z.string().optional(),
    inspectionDate: z
        .string()
        .datetime({ message: "Ngay kiem tra khong hop le" }),
});
export type CreateSecurityRecordInput = z.infer<
    typeof createSecurityRecordSchema
>;

export const updateSecurityRecordSchema = createSecurityRecordSchema.partial();
export type UpdateSecurityRecordInput = z.infer<
    typeof updateSecurityRecordSchema
>;
