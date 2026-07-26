import { z } from "zod";
import { LOAI_YEU_CAU_HO_TRO, TRANG_THAI_YEU_CAU_HO_TRO } from "@/types";

export const createSupportTicketSchema = z.object({
    type: z.enum(LOAI_YEU_CAU_HO_TRO),
    title: z.string().min(3, "Tieu de qua ngan"),
    content: z.string().min(10, "Noi dung qua ngan"),
    images: z.array(z.string()).max(6).optional(),
    deviceInfo: z.string().optional(),
});
export type CreateSupportTicketInput = z.infer<
    typeof createSupportTicketSchema
>;

export const updateSupportTicketStatusSchema = z.object({
    status: z.enum(TRANG_THAI_YEU_CAU_HO_TRO),
    response: z.string().optional(),
});
export type UpdateSupportTicketStatusInput = z.infer<
    typeof updateSupportTicketStatusSchema
>;
