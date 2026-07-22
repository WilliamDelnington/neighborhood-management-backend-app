import { z } from "zod";

export const createBusinessSchema = z.object({
    name: z.string().min(1, "Ten ho kinh doanh khong duoc de trong"),
    houseId: z.string().min(1, "Thieu nha so"),
    // null = khong gan loai hinh kinh doanh, undefined = khong doi.
    businessType: z.string().nullable().optional(),
    ownerName: z.string().optional(),
    phone: z.string().optional(),
    active: z.boolean().default(true),
    note: z.string().optional(),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = createBusinessSchema
    .omit({ houseId: true })
    .partial();
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
