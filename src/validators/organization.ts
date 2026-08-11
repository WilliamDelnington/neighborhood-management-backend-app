import { z } from "zod";
import { ORGANIZATION_TYPE } from "@/types";

export const createOrganizationSchema = z.object({
    name: z.string().min(1, "Tên tổ chức không được để trống"),
    // Khong bat buoc - khong phai to chuc nao cung co ma so thue/dang ky kinh
    // doanh (xem models/Organization.ts).
    taxCode: z.string().trim().min(1).optional(),
    organizationType: z.enum(ORGANIZATION_TYPE).default("khac"),
    // Nguoi dai dien BAN DAU luc tao - phai la tai khoan User co vai tro
    // house_owner (xem organizationService.assertRepresentativeUser).
    // House_owner tu tao to chuc luon bi ep ve chinh minh o service layer (bat
    // ke gia tri gui len, truong nay co the bo trong) - chi admin moi bat
    // buoc phai chon. Duoc tao thanh ban ghi OrganizationRepresentative
    // (role="legal_representative"), KHONG con la field truc tiep tren
    // Organization - xem organizationRepresentativeService.ts.
    representativeUserId: z.string().optional(),
    // Chuc danh tu do cua nguoi dai dien ban dau (vd "Giam doc") - luu vao
    // OrganizationRepresentative.title, khong bat buoc.
    representativeTitle: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    active: z.boolean().default(true),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// taxCode la bat bien (immutable) sau khi tao, giong Street.code.
// representativeUserId KHONG the sua qua PATCH nay nua - doi nguoi dai dien
// phai di qua /organizations/:id/representatives (them/ket thuc/xac thuc),
// dam bao luon co lich su thay vi bi ghi de - xem
// organizationRepresentativeService.ts.
export const updateOrganizationSchema = createOrganizationSchema
    .omit({ taxCode: true, representativeUserId: true, representativeTitle: true })
    .partial();
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
