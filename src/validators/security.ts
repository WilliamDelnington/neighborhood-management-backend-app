import { z } from "zod";
import { LOAI_SO_HUU, MUC_DO_AN_NINH, TINH_TRANG_THEO_DOI_AN_NINH } from "@/types";

export const createSecurityRecordSchema = z.object({
    houseId: z.string().min(1, "Thieu ma nha"),
    ownershipType: z.enum(LOAI_SO_HUU).default("chinh_chu"),
    renterCount: z.number().int().min(0).default(0),
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

export const assignSecurityRecordSchema = z.object({
    assigneeId: z.string().min(1),
});
export type AssignSecurityRecordInput = z.infer<
    typeof assignSecurityRecordSchema
>;
