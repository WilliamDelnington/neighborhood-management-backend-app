import { z } from "zod";
import { LOAI_SO_HUU } from "@/types";

export const createResidentRecordSchema = z.object({
    houseId: z.string().min(1, "Thiếu mã nhà"),
    ownershipType: z.enum(LOAI_SO_HUU).default("chinh_chu"),
    renterCount: z.number().int().min(0).default(0),
    inspectionDate: z
        .string()
        .datetime({ message: "Ngày kiểm tra không hợp lệ" }),
});
export type CreateResidentRecordInput = z.infer<
    typeof createResidentRecordSchema
>;

export const updateResidentRecordSchema =
    createResidentRecordSchema.partial();
export type UpdateResidentRecordInput = z.infer<
    typeof updateResidentRecordSchema
>;
