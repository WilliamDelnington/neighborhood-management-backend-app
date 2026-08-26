import { z } from "zod";
import { VERIFICATION_STATUS } from "@/types";

export const createCompanySchema = z.object({
    name: z.string().min(1, "Tên công ty không được để trống"),
    houseId: z.string().min(1, "Thiếu nhà số"),
    ownerName: z.string().optional(),
    // Bat buoc - khac Business (tuy chon) - xem models/Company.ts.
    taxCode: z.string().trim().min(1, "Mã số thuế không được để trống"),
    representativeUserId: z.string().nullable().optional(),
    // Lien ket tuy chon toi mot Organization co san (khong tao moi) - xem
    // ghi chu tren models/Company.ts.
    organizationId: z.string().nullable().optional(),
    // Nhieu loai hinh kinh doanh cung luc (khac Business - mot gia tri duy
    // nhat) - mang rong = khong gan loai hinh nao, undefined (update) =
    // khong doi.
    businessTypeIds: z.array(z.string()).optional(),
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
