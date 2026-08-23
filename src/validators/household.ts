import { z } from "zod";
import { LOAI_SO_HUU, VERIFICATION_STATUS } from "@/types";

// memberCount KHONG nam trong schema nay - so nhan khau duoc he thong tu tinh
// (dua tren so ban ghi Citizen thuc te thuoc ho dan), khong cho phep nhap tay
// qua API (xem citizenService.ts - createCitizen/updateCitizen/deleteCitizen
// tu dong +1/-1 vao Household.memberCount).
const householdBaseSchema = z.object({
    cluster: z.string().min(1, "Cụm dân cư không được để trống"),
    // Street chuan hoa tuong ung voi cluster (chi dung khi ho dan "mo coi",
    // khong gan nha so - xem streetSync.ts). Client cu khong gui truong nay
    // van hoat dong binh thuong.
    streetId: z.string().nullable().optional(),
    address: z.string().min(1, "Địa chỉ không được để trống"),
    headOfHousehold: z.string().min(1, "Tên chủ hộ không được để trống"),
    // Lien ket toi tai khoan house_owner thuc su cua chu ho - null = go lien
    // ket, undefined = khong doi.
    headOfHouseholdUserId: z.string().nullable().optional(),
    // So dien thoai cua nguoi lien he cho ho dan nay - bat buoc khi tao moi
    // (xem refine ben duoi tren createHouseholdSchema), tuy chon khi cap nhat.
    phone: z.string().min(1, "Số điện thoại liên hệ không được để trống"),
    // true = nguoi lien he chinh la chu ho (contactName bo qua, Citizen "Chủ hộ"
    // duoc tao voi phone o tren); false = nguoi lien he la mot nhan khau khac,
    // bat buoc phai co contactName - xem refine ben duoi va
    // householdService.createHousehold (tao them mot Citizen "Người liên hệ").
    contactIsHead: z.boolean().default(true),
    contactName: z.string().optional(),
    ownershipType: z.enum(LOAI_SO_HUU).default("chinh_chu"),
    needsSupport: z.boolean().default(false),
    // null = go lien ket voi nha so (chua gan), undefined = khong doi.
    houseId: z.string().nullable().optional(),
    note: z.string().optional(),
});

export const createHouseholdSchema = householdBaseSchema.refine(
    data => data.contactIsHead || !!data.contactName?.trim(),
    {
        message: "Vui lòng nhập tên người liên hệ",
        path: ["contactName"],
    },
);
export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

export const updateHouseholdSchema = householdBaseSchema.partial();
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;

export const updateHouseholdStatusSchema = z
    .object({
        status: z.enum(VERIFICATION_STATUS),
        note: z.string().optional(),
    })
    .refine(data => data.status !== "denied" || !!data.note?.trim(), {
        message: "Vui lòng nhập lý do khi từ chối hộ dân",
        path: ["note"],
    });
export type UpdateHouseholdStatusInput = z.infer<
    typeof updateHouseholdStatusSchema
>;
