import { z } from "zod";
import { LOAI_SO_HUU, VERIFICATION_STATUS } from "@/types";

// memberCount KHONG nam trong schema nay - so nhan khau duoc he thong tu tinh
// (dua tren so ban ghi Citizen thuc te thuoc ho dan), khong cho phep nhap tay
// qua API (xem citizenService.ts - createCitizen/updateCitizen/deleteCitizen
// tu dong +1/-1 vao Household.memberCount).
export const createHouseholdSchema = z.object({
    cluster: z.string().min(1, "Cum dan cu khong duoc de trong"),
    // Street chuan hoa tuong ung voi cluster (chi dung khi ho dan "mo coi",
    // khong gan nha so - xem streetSync.ts). Client cu khong gui truong nay
    // van hoat dong binh thuong.
    streetId: z.string().nullable().optional(),
    address: z.string().min(1, "Dia chi khong duoc de trong"),
    headOfHousehold: z.string().min(1, "Ten chu ho khong duoc de trong"),
    // Lien ket toi tai khoan house_owner thuc su cua chu ho - null = go lien
    // ket, undefined = khong doi.
    headOfHouseholdUserId: z.string().nullable().optional(),
    phone: z.string().optional(),
    ownershipType: z.enum(LOAI_SO_HUU).default("chinh_chu"),
    needsSupport: z.boolean().default(false),
    // null = go lien ket voi nha so (chua gan), undefined = khong doi.
    houseId: z.string().nullable().optional(),
    note: z.string().optional(),
});
export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

export const updateHouseholdSchema = createHouseholdSchema.partial();
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;

export const updateHouseholdStatusSchema = z
    .object({
        status: z.enum(VERIFICATION_STATUS),
        note: z.string().optional(),
    })
    .refine(data => data.status !== "denied" || !!data.note?.trim(), {
        message: "Vui long nhap ly do khi tu choi ho dan",
        path: ["note"],
    });
export type UpdateHouseholdStatusInput = z.infer<
    typeof updateHouseholdStatusSchema
>;
