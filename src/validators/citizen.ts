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
    // Bat buoc khi residenceType="tam_tru" (xem refine ben duoi) - khoang thoi
    // gian khai bao tam tru (tu ngay - den ngay).
    temporaryResidenceStartsAt: z.string().datetime().optional(),
    temporaryResidenceExpiresAt: z.string().datetime().optional(),
    // Da/chua khai bao cu tru voi UBND - doc lap voi residenceType.
    isResidencyDeclared: z.boolean().default(false),
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

// Dung chung cho ca create va update - CHI kiem tra thu tu ngay khi CA HAI
// gia tri cung co mat trong payload (update la partial schema nen khong the
// gia dinh gia tri con lai da co san tren ban ghi).
const isTemporaryResidenceRangeValid = (data: {
    temporaryResidenceStartsAt?: string;
    temporaryResidenceExpiresAt?: string;
}) =>
    !data.temporaryResidenceStartsAt ||
    !data.temporaryResidenceExpiresAt ||
    new Date(data.temporaryResidenceStartsAt) <=
        new Date(data.temporaryResidenceExpiresAt);

export const createCitizenSchema = citizenBaseSchema
    .refine(
        data =>
            data.residenceType !== "tam_tru" ||
            (!!data.temporaryResidenceStartsAt &&
                !!data.temporaryResidenceExpiresAt),
        {
            message: "Vui lòng nhập thời hạn tạm trú",
            path: ["temporaryResidenceExpiresAt"],
        },
    )
    .refine(isTemporaryResidenceRangeValid, {
        message: "Ngày bắt đầu tạm trú phải trước ngày hết hạn",
        path: ["temporaryResidenceExpiresAt"],
    })
    .refine(data => !data.isOtherSpecial || !!data.otherSpecialLabel?.trim(), {
        message: "Vui lòng nhập tên diện ưu tiên khác",
        path: ["otherSpecialLabel"],
    });
export type CreateCitizenInput = z.infer<typeof createCitizenSchema>;

export const updateCitizenSchema = citizenBaseSchema
    .partial()
    .refine(isTemporaryResidenceRangeValid, {
        message: "Ngày bắt đầu tạm trú phải trước ngày hết hạn",
        path: ["temporaryResidenceExpiresAt"],
    })
    .refine(
        data => !data.isOtherSpecial || !!data.otherSpecialLabel?.trim(),
        {
            message: "Vui lòng nhập tên diện ưu tiên khác",
            path: ["otherSpecialLabel"],
        },
    );
export type UpdateCitizenInput = z.infer<typeof updateCitizenSchema>;
