import { z } from "zod";
import { GIOI_TINH, LOAI_CU_TRU } from "@/types";

export const createCitizenSchema = z.object({
    fullName: z.string().min(1, "Ho ten khong duoc de trong"),
    phone: z.string().optional(),
    cccd: z.string().optional(),
    birthDate: z.string().datetime().optional(),
    gender: z.enum(GIOI_TINH).default("nam"),
    relationToHead: z.string().optional(),
    householdId: z.string().min(1, "Phai chon ho khau"),
    residenceType: z.enum(LOAI_CU_TRU).default("thuong_tru"),
    isElderly: z.boolean().default(false),
    isChild: z.boolean().default(false),
    isDisabledOrSupportNeeded: z.boolean().default(false),
    isPartyMember: z.boolean().default(false),
    isUnionMember: z.boolean().default(false),
    zaloUserId: z.string().optional(),
});
export type CreateCitizenInput = z.infer<typeof createCitizenSchema>;

export const updateCitizenSchema = createCitizenSchema.partial();
export type UpdateCitizenInput = z.infer<typeof updateCitizenSchema>;
