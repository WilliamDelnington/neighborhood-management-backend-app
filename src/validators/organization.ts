import { z } from "zod";
import { ORGANIZATION_TYPE } from "@/types";

export const createOrganizationSchema = z.object({
    name: z.string().min(1, "Tên tổ chức không được để trống"),
    // Khong bat buoc - khong phai to chuc nao cung co ma so thue/dang ky kinh
    // doanh (xem models/Organization.ts).
    taxCode: z.string().trim().min(1).optional(),
    organizationType: z.enum(ORGANIZATION_TYPE).default("khac"),
    // Nguoi dai dien - phai la tai khoan User co vai tro house_owner (xem
    // organizationService.assertRepresentativeUser). House_owner tu tao to
    // chuc luon bi ep ve chinh minh o service layer (bat ke gia tri gui len,
    // truong nay co the bo trong) - chi admin moi bat buoc phai chon.
    representativeUserId: z.string().optional(),
    representativeRole: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    active: z.boolean().default(true),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// taxCode la bat bien (immutable) sau khi tao, giong Street.code.
export const updateOrganizationSchema = createOrganizationSchema
    .omit({ taxCode: true })
    .partial();
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
