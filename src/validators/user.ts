import { z } from "zod";
import { USER_STATUS } from "@/types";
import { isValidVnPhone } from "@/lib/phone";

// Vai tro duoc phep tao qua man hinh nay - house_owner mo cho bat ky ai co
// quyen "users.create" (hanh vi cu, vd to truong tao chu ho); ba vai tro con
// lai (to truong/to pho/cong tac vien To dan pho) CHI admin moi duoc chon,
// kiem tra rieng trong userService.createHouseOwnerByStaff (khong the bieu
// dat "admin-only" bang zod don thuan) vi day la cac vai tro co pham vi rong
// (to truong/to pho) hoac can gan vao mot To dan pho cu the sau khi tao.
export const CREATABLE_STAFF_ROLES = [
    "house_owner",
    "neighborhood_leader",
    "neighborhood_coleader",
    "neighborhood_collaborator",
] as const;

// Nhan vien (to truong/admin) tao tai khoan chu ho (hoac to truong/to pho/
// cong tac vien, admin-only) thay - cung dinh dang voi registerWithPhone
// (phone+password tu dang ky), chi khac o cho ai la actor va co them dia chi
// tuy chon (xem userService.createHouseOwnerByStaff).
// password: TAM THOI cho phep dat mat khau luc tao (thay OTP/Zalo, hien chua
// san sang do can duyet mau tin truoc - xem LoginPage.tsx o mini app).
export const createHouseOwnerSchema = z.object({
    phone: z
        .string()
        .min(1, "Thiếu số điện thoại")
        .refine(isValidVnPhone, "Số điện thoại không hợp lệ"),
    displayName: z.string().min(1, "Thiếu họ tên"),
    address: z.string().optional(),
    idNumber: z.string().min(1, "Thiếu số CMND/CCCD"),
    role: z.enum(CREATABLE_STAFF_ROLES).default("house_owner"),
    password: z
        .string()
        .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
        .optional(),
});
export type CreateHouseOwnerInput = z.infer<typeof createHouseOwnerSchema>;

export const updateUserSchema = z
    .object({
        displayName: z.string().min(1).optional(),
        phone: z.string().optional(),
        status: z.enum(USER_STATUS).optional(),
        // Bat buoc khi doi status (khoa/mo tai khoan) - xem refine ben duoi.
        // Khong dung cho cac lan cap nhat khac (doi ten, gan cum...).
        statusReason: z.string().optional(),
        householdId: z.string().nullable().optional(),
        citizenId: z.string().nullable().optional(),
        assignedClusters: z.array(z.string()).optional(),
        // Vai tro la du lieu dong - tinh hop le (ton tai, active) duoc kiem tra
        // trong updateUserByAdmin, khong con the kiem bang z.enum tinh.
        primaryRole: z.string().min(1).optional(),
        // Pham vi phuong/xa cho people_committee_official va secretary - xem
        // User.ts. Gui ca 4 truong cung luc (tu WardPicker), null de xoa gan.
        provinceCode: z.number().nullable().optional(),
        provinceName: z.string().nullable().optional(),
        wardCode: z.number().nullable().optional(),
        wardName: z.string().nullable().optional(),
    })
    .refine(data => data.status === undefined || !!data.statusReason?.trim(), {
        message: "Vui lòng nhập lý do khi khóa/mở tài khoản",
        path: ["statusReason"],
    });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// Dung cho endpoint khoa/mo tai khoan rieng (users.lock) - hep hon
// updateUserSchema: chi status + ly do bat buoc, khong cho sua truong nao
// khac (xem userService.lockUserStatus).
export const lockUserStatusSchema = z.object({
    status: z.enum(["active", "locked"]),
    statusReason: z.string().min(1, "Vui lòng nhập lý do khóa/mở tài khoản"),
});
export type LockUserStatusInput = z.infer<typeof lockUserStatusSchema>;

export const assignRoleSchema = z.object({
    userId: z.string().min(1),
    role: z.string().min(1),
    scopeType: z
        .enum(["all", "cluster", "household", "complaint", "module"])
        .default("all"),
    scopeValues: z.array(z.string()).default([]),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const revokeRoleSchema = z.object({
    userId: z.string().min(1),
    role: z.string().min(1),
});
export type RevokeRoleInput = z.infer<typeof revokeRoleSchema>;
