import { z } from "zod";

export const createUtilityAppSchema = z.object({
    name: z.string().min(1, "Tên không được để trống"),
    icon: z.string().min(1, "Thiếu icon (URL ảnh)"),
    url: z.string().min(1, "Thiếu đường dẫn"),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
});
export type CreateUtilityAppInput = z.infer<typeof createUtilityAppSchema>;

export const updateUtilityAppSchema = createUtilityAppSchema.partial();
export type UpdateUtilityAppInput = z.infer<typeof updateUtilityAppSchema>;
