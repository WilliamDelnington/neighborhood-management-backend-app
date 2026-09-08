import { z } from "zod";
import { USER_STATUS } from "@/types";
import { isValidVnPhone } from "@/lib/phone";

// Vai tro KHONG duoc tao truc tiep qua man "Tao tai khoan" nay, du la vai tro
// he thong hay vai tro tuy chinh admin them sau nay qua man Quan ly vai tro -
// cac vai tro nay gan vao TAI KHOAN DA CO SAN qua cac luong khac (vd "Gan vai
// tro moi" o UserListPage.tsx, hoac gan can bo o WardManagementPage.tsx) thay
// vi tao tai khoan phone+password moi o day: admin (khong ai duoc tu tao tai
// khoan admin), household_head (gan vao Household.headOfHouseholdUserId tro
// ve mot tai khoan da co, khong tao rieng), secretary/regional_police/
// people_committee_official (can bo phuong da co tai khoan tu truoc, chi duoc
// GAN vai tro nay). Vai tro con lai (house_owner luon mo, cac vai tro con lai
// CHI admin moi duoc chon - kiem tra trong userService.createHouseOwnerByStaff)
// deu la du lieu dong (xem model Role) nen KHONG con liet ke tinh o day - xem
// getCreatableExtraRoles trong userService.ts.
export const ACCOUNT_CREATION_RESERVED_ROLE_KEYS = [
    "admin",
    "household_head",
    // Cung ly do voi household_head: gan vao Business/Company.representativeUserId
    // tro ve mot tai khoan da co (hoac tao qua createBusinessRepresentativeByOwner/
    // createCompanyRepresentativeByOwner do chu nha thuc hien), khong tao qua
    // man "Tạo tài khoản" nay.
    "business_representative",
    "company_representative",
    "secretary",
    "regional_police",
    "people_committee_official",
];

// Nhan vien (to truong/admin) tao tai khoan chu ho (hoac to truong/to pho/
// cong tac vien/vai tro tuy chinh khac, admin-only) thay - cung dinh dang voi
// registerWithPhone (phone+password tu dang ky), chi khac o cho ai la actor va
// co them dia chi tuy chon (xem userService.createHouseOwnerByStaff). role la
// du lieu dong (xem model Role) nen khong con kiem bang z.enum tinh - tinh hop
// le (ton tai, active, khong nam trong ACCOUNT_CREATION_RESERVED_ROLE_KEYS)
// duoc kiem trong userService.createHouseOwnerByStaff.
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
    role: z.string().min(1).default("house_owner"),
    password: z
        .string()
        .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
        .optional(),
});
export type CreateHouseOwnerInput = z.infer<typeof createHouseOwnerSchema>;

// Chu nha (house_owner) tu tao tai khoan cho nguoi quan ly thay MOT thuc the
// cu the cua minh (chu ho cua 1 ho dan, dai dien cua 1 ho kinh doanh/cong ty) -
// cung dinh dang voi createHouseOwnerSchema nhung KHONG co truong role (vai
// tro co dinh theo tung ham goi - xem userService.createHouseholdHeadByOwner/
// createBusinessRepresentativeByOwner/createCompanyRepresentativeByOwner).
export const createOwnerManagedAccountSchema = z.object({
    phone: z
        .string()
        .min(1, "Thiếu số điện thoại")
        .refine(isValidVnPhone, "Số điện thoại không hợp lệ"),
    displayName: z.string().min(1, "Thiếu họ tên"),
    address: z.string().optional(),
    idNumber: z.string().min(1, "Thiếu số CMND/CCCD"),
    password: z
        .string()
        .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
        .optional(),
});
export type CreateOwnerManagedAccountInput = z.infer<
    typeof createOwnerManagedAccountSchema
>;

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

// Dung cho endpoint admin/to truong dat lai mat khau cho MOT tai khoan bat ky
// (khac setPassword trong authService.ts - tu doi mat khau cua chinh minh) -
// xem userService.resetUserPasswordByAdmin.
export const resetUserPasswordSchema = z.object({
    password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;

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
