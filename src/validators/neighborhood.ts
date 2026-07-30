import { z } from "zod";

export const createNeighborhoodSchema = z.object({
    name: z.string().min(1, "Tên tổ dân phố không được để trống"),
    code: z.string().min(1, "Mã tổ dân phố không được để trống"),
    sequence: z.number().int().positive("Số thứ tự phải là số nguyên dương"),
    active: z.boolean().default(true),
    address: z.string().optional(),
    description: z.string().optional(),
    contactPhone: z.string().optional(),
    notes: z.string().optional(),
});
export type CreateNeighborhoodInput = z.infer<typeof createNeighborhoodSchema>;

// code/sequence la bat bien (immutable) sau khi tao - khong cho sua qua API.
export const updateNeighborhoodSchema = createNeighborhoodSchema
    .omit({ code: true, sequence: true })
    .partial();
export type UpdateNeighborhoodInput = z.infer<typeof updateNeighborhoodSchema>;

export const assignLeaderSchema = z.object({
    leaderUserId: z.string().nullable(),
    note: z.string().optional(),
});
export type AssignLeaderInput = z.infer<typeof assignLeaderSchema>;
