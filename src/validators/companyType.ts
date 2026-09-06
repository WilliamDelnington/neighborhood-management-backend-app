import { z } from "zod";

export const createCompanyTypeSchema = z.object({
    name: z.string().min(1, "Tên loại hình doanh nghiệp không được để trống"),
    description: z.string().optional(),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
});
export type CreateCompanyTypeInput = z.infer<typeof createCompanyTypeSchema>;

export const updateCompanyTypeSchema = createCompanyTypeSchema.partial();
export type UpdateCompanyTypeInput = z.infer<typeof updateCompanyTypeSchema>;
