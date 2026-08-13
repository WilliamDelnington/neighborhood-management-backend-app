import { z } from "zod";
import { GIOI_TINH, LOAI_CU_TRU } from "@/types";

const citizenBaseSchema = z.object({
    fullName: z.string().min(1, "Ho ten khong duoc de trong"),
    phone: z.string().optional(),
    cccd: z.string().optional(),
    birthDate: z.string().datetime().optional(),
    gender: z.enum(GIOI_TINH).default("nam"),
    relationToHead: z.string().optional(),
    householdId: z.string().min(1, "Phai chon ho khau"),
    residenceType: z.enum(LOAI_CU_TRU).default("thuong_tru"),
    // Bat buoc khi residenceType="tam_tru" (xem refine ben duoi) - ngay het
    // han khai bao tam tru.
    temporaryResidenceExpiresAt: z.string().datetime().optional(),
    isElderly: z.boolean().default(false),
    isChild: z.boolean().default(false),
    isDisabledOrSupportNeeded: z.boolean().default(false),
    isPartyMember: z.boolean().default(false),
    isUnionMember: z.boolean().default(false),
    zaloUserId: z.string().optional(),
});

export const createCitizenSchema = citizenBaseSchema.refine(
    data =>
        data.residenceType !== "tam_tru" || !!data.temporaryResidenceExpiresAt,
    {
        message: "Vui long nhap thoi han tam tru",
        path: ["temporaryResidenceExpiresAt"],
    },
);
export type CreateCitizenInput = z.infer<typeof createCitizenSchema>;

export const updateCitizenSchema = citizenBaseSchema.partial();
export type UpdateCitizenInput = z.infer<typeof updateCitizenSchema>;
