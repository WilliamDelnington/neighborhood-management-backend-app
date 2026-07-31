import { z } from "zod";

export const createStreetSchema = z.object({
    name: z.string().min(1, "Tên đường/phố không được để trống"),
    code: z.string().min(1, "Mã đường/phố không được để trống"),
    active: z.boolean().default(true),
});
export type CreateStreetInput = z.infer<typeof createStreetSchema>;

// code la bat bien (immutable) sau khi tao, giong Neighborhood.
export const updateStreetSchema = createStreetSchema
    .omit({ code: true })
    .partial();
export type UpdateStreetInput = z.infer<typeof updateStreetSchema>;
