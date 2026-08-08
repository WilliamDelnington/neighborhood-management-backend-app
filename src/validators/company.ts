import { z } from "zod";
import { VERIFICATION_STATUS } from "@/types";

export const createCompanySchema = z.object({
    name: z.string().min(1, "Ten cong ty khong duoc de trong"),
    houseId: z.string().min(1, "Thieu nha so"),
    ownerName: z.string().optional(),
    phone: z.string().optional(),
    active: z.boolean().default(true),
    note: z.string().optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema
    .omit({ houseId: true })
    .partial();
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const updateCompanyStatusSchema = z.object({
    status: z.enum(VERIFICATION_STATUS),
});
export type UpdateCompanyStatusInput = z.infer<
    typeof updateCompanyStatusSchema
>;
