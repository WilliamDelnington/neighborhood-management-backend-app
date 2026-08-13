import { z } from "zod";

export const createUtilityAppSchema = z.object({
    name: z.string().min(1, "Ten khong duoc de trong"),
    icon: z.string().min(1, "Thieu icon (URL anh)"),
    url: z.string().min(1, "Thieu duong dan"),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
});
export type CreateUtilityAppInput = z.infer<typeof createUtilityAppSchema>;

export const updateUtilityAppSchema = createUtilityAppSchema.partial();
export type UpdateUtilityAppInput = z.infer<typeof updateUtilityAppSchema>;
