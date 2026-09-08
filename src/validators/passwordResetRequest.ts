import { z } from "zod";
import { isValidVnPhone } from "@/lib/phone";
import { TRANG_THAI_YEU_CAU_DAT_LAI_MAT_KHAU } from "@/types";

export const createPasswordResetRequestSchema = z.object({
    phone: z
        .string()
        .min(1, "Thiếu số điện thoại")
        .refine(isValidVnPhone, "Số điện thoại không hợp lệ"),
    note: z.string().max(500, "Ghi chú quá dài").optional(),
});
export type CreatePasswordResetRequestInput = z.infer<
    typeof createPasswordResetRequestSchema
>;

export const updatePasswordResetRequestStatusSchema = z.object({
    status: z.enum(TRANG_THAI_YEU_CAU_DAT_LAI_MAT_KHAU),
});
export type UpdatePasswordResetRequestStatusInput = z.infer<
    typeof updatePasswordResetRequestStatusSchema
>;
