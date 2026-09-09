import { z } from "zod";
import { GIOI_TINH, LOAI_CU_TRU } from "@/types";

const citizenBaseSchema = z.object({
    fullName: z.string().min(1, "Họ tên không được để trống"),
    phone: z.string().optional(),
    cccd: z.string().optional(),
    birthDate: z.string().datetime().optional(),
    gender: z.enum(GIOI_TINH).default("nam"),
    relationToHead: z.string().optional(),
    occupation: z.string().optional(),
    householdId: z.string().min(1, "Phải chọn hộ khẩu"),
    residenceType: z.enum(LOAI_CU_TRU).default("thuong_tru"),
    // Bat buoc khi residenceType="tam_tru" (xem refine ben duoi) - ngay het
    // han khai bao tam tru.
    temporaryResidenceExpiresAt: z.string().datetime().optional(),
    isElderly: z.boolean().default(false),
    isChild: z.boolean().default(false),
    isDisabledOrSupportNeeded: z.boolean().default(false),
    isDisabledChild: z.boolean().default(false),
    isPartyMember: z.boolean().default(false),
    isUnionMember: z.boolean().default(false),
    isMartyr: z.boolean().default(false),
    isMartyrFamily: z.boolean().default(false),
    isVeteran: z.boolean().default(false),
    isOtherSpecial: z.boolean().default(false),
    otherSpecialLabel: z.string().optional(),
    zaloUserId: z.string().optional(),
});

export const createCitizenSchema = citizenBaseSchema
    .refine(
        data =>
            data.residenceType !== "tam_tru" ||
            !!data.temporaryResidenceExpiresAt,
        {
            message: "Vui lòng nhập thời hạn tạm trú",
            path: ["temporaryResidenceExpiresAt"],
        },
    )
    .refine(data => !data.isOtherSpecial || !!data.otherSpecialLabel?.trim(), {
        message: "Vui lòng nhập tên diện ưu tiên khác",
        path: ["otherSpecialLabel"],
    });
export type CreateCitizenInput = z.infer<typeof createCitizenSchema>;

export const updateCitizenSchema = citizenBaseSchema.partial().refine(
    data => !data.isOtherSpecial || !!data.otherSpecialLabel?.trim(),
    {
        message: "Vui lòng nhập tên diện ưu tiên khác",
        path: ["otherSpecialLabel"],
    },
);
export type UpdateCitizenInput = z.infer<typeof updateCitizenSchema>;
