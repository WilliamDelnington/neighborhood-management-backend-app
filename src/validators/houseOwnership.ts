import { z } from "zod";
import { OWNER_TYPE, HOUSE_OWNERSHIP_RELATIONSHIP_TYPES } from "@/types";
import { isValidVnPhone } from "@/lib/phone";

// ownerId (id User/Organization co san, chon qua picker o admin-web-app) hoac
// phone (so dien thoai, dung o mini app khi house_owner tu moi mot tai khoan
// da ton tai lam dong so huu/nguoi quan ly - xem
// houseOwnershipService.resolveExistingOwnerId). phone CHI resolve tai khoan
// da ton tai, KHONG tao moi (tao tai khoan thay nguoi khac can quyen
// "users.create" rieng, xem houseRecordService.resolveOrCreateHouseOwner) -
// nen chi ap dung cho ownerType="user".
export const addHouseOwnershipSchema = z
    .object({
        ownerType: z.enum(OWNER_TYPE),
        ownerId: z.string().min(1).optional(),
        phone: z
            .string()
            .refine(isValidVnPhone, "So dien thoai khong hop le")
            .optional(),
        relationshipType: z.enum(HOUSE_OWNERSHIP_RELATIONSHIP_TYPES),
        reason: z.string().optional(),
    })
    .refine(data => !!data.ownerId || (data.ownerType === "user" && !!data.phone), {
        message: "Thieu id chu so huu/to chuc (hoac so dien thoai voi ca nhan)",
        path: ["ownerId"],
    });
export type AddHouseOwnershipInput = z.infer<typeof addHouseOwnershipSchema>;

export const endHouseOwnershipSchema = z.object({
    reason: z.string().optional(),
});
export type EndHouseOwnershipInput = z.infer<typeof endHouseOwnershipSchema>;
