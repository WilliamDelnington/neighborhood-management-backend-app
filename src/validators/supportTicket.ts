import { z } from "zod";
import { LOAI_YEU_CAU_HO_TRO, TRANG_THAI_YEU_CAU_HO_TRO } from "@/types";

export const createSupportTicketSchema = z.object({
    type: z.enum(LOAI_YEU_CAU_HO_TRO),
    title: z.string().trim().min(1, "Vui lòng nhập tiêu đề"),
    content: z.string().trim().min(1, "Vui lòng nhập nội dung"),
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

export const updateSupportTicketSchema = z.object({
    content: z.string().trim().min(1, "Vui lòng nhập nội dung"),
});
export type UpdateSupportTicketInput = z.infer<
    typeof updateSupportTicketSchema
>;
