import { z } from "zod";
import { HOUSE_RECORD_STATUS } from "@/types";

export const createHouseRecordSchema = z.object({
    cluster: z.string().min(1, "Cum dan cu khong duoc de trong"),
    address: z.string().min(1, "Dia chi khong duoc de trong"),
    note: z.string().optional(),
    residenceDeclarationNumber: z.string().optional(),
});
export type CreateHouseRecordInput = z.infer<typeof createHouseRecordSchema>;

export const updateHouseRecordSchema = createHouseRecordSchema.partial();
export type UpdateHouseRecordInput = z.infer<typeof updateHouseRecordSchema>;

export const updateHouseRecordStatusSchema = z.object({
    status: z.enum(HOUSE_RECORD_STATUS),
});
export type UpdateHouseRecordStatusInput = z.infer<
    typeof updateHouseRecordStatusSchema
>;
