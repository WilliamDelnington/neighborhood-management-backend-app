import { z } from "zod";
import { OWNER_TYPE, HOUSE_OWNERSHIP_RELATIONSHIP_TYPES } from "@/types";
import { isValidVnPhone } from "@/lib/phone";

// ownerId (id User/Organization co san, chon qua picker o admin-web-app) hoac
// phone (so dien thoai, dung o mini app khi house_owner tu moi mot tai khoan
// da ton tai lam dong so huu/nguoi quan ly - xem
// houseOwnershipService.resolveExistingOwnerId). phone mac dinh CHI resolve
// tai khoan da ton tai; neu kem password + displayName VA actor co quyen
// "users.create", se tao tai khoan moi luon (TAM THOI dung phone+password
// thay OTP - xem LoginPage.tsx) - nen chi ap dung cho ownerType="user".
export const addHouseOwnershipSchema = z
    .object({
        ownerType: z.enum(OWNER_TYPE),
        ownerId: z.string().min(1).optional(),
        phone: z
            .string()
            .refine(isValidVnPhone, "So dien thoai khong hop le")
            .optional(),
        // Chi dung khi tao tai khoan moi (phone chua co tai khoan) - bo qua
        // neu phone da co tai khoan san.
        displayName: z.string().min(1).optional(),
        password: z
            .string()
            .min(6, "Mat khau phai co it nhat 6 ky tu")
            .optional(),
        relationshipType: z.enum(HOUSE_OWNERSHIP_RELATIONSHIP_TYPES),
        reason: z.string().optional(),
    })
    .refine(data => !!data.ownerId || (data.ownerType === "user" && !!data.phone), {
        message: "Thieu id chu so huu/to chuc (hoac so dien thoai voi ca nhan)",
        path: ["ownerId"],
    })
    .refine(data => !data.password || !!data.displayName?.trim(), {
        message: "Vui long nhap ten khi tao tai khoan moi",
        path: ["displayName"],
    });
export type AddHouseOwnershipInput = z.infer<typeof addHouseOwnershipSchema>;

export const endHouseOwnershipSchema = z.object({
    reason: z.string().optional(),
});
export type EndHouseOwnershipInput = z.infer<typeof endHouseOwnershipSchema>;

// note bat buoc khi tu choi (giong quy uoc decideChangeRequestSchema), khong
// bat buoc khi xac thuc.
export const verifyHouseOwnershipSchema = z
    .object({
        decision: z.enum(["verified", "rejected"]),
        note: z.string().optional(),
    })
    .refine(data => data.decision === "verified" || !!data.note?.trim(), {
        message: "Vui long nhap ly do khi tu choi",
        path: ["note"],
    });
export type VerifyHouseOwnershipInput = z.infer<
    typeof verifyHouseOwnershipSchema
>;
