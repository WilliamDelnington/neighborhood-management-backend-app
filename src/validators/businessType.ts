import { z } from "zod";

export const createBusinessTypeSchema = z.object({
    name: z.string().min(1, "Ten loai hinh kinh doanh khong duoc de trong"),
    description: z.string().optional(),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
});
export type CreateBusinessTypeInput = z.infer<typeof createBusinessTypeSchema>;

export const updateBusinessTypeSchema = createBusinessTypeSchema.partial();
export type UpdateBusinessTypeInput = z.infer<typeof updateBusinessTypeSchema>;
