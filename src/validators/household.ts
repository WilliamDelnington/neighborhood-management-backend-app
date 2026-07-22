import { z } from "zod";
import { LOAI_SO_HUU } from "@/types";

// memberCount KHONG nam trong schema nay - so nhan khau duoc he thong tu tinh
// (dua tren so ban ghi Citizen thuc te thuoc ho dan), khong cho phep nhap tay
// qua API (xem citizenService.ts - createCitizen/updateCitizen/deleteCitizen
// tu dong +1/-1 vao Household.memberCount).
export const createHouseholdSchema = z.object({
    cluster: z.string().min(1, "Cum dan cu khong duoc de trong"),
    address: z.string().min(1, "Dia chi khong duoc de trong"),
    headOfHousehold: z.string().min(1, "Ten chu ho khong duoc de trong"),
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
