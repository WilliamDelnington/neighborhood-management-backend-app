import { z } from "zod";
import { isValidVnPhone } from "@/lib/phone";

// Trung voi models/OtpChallenge.ts OTP_PURPOSES - khong import truc tiep tu
// @/models o day de tranh keo theo toan bo Mongoose model index (vd
// lib/encryption.ts nem loi ngay luc import neu thieu ENCRYPTION_KEY) vao
// module validator, giong ly do cac script backfill phai import model dong.
const OTP_PURPOSES = ["register", "login"] as const;

const phoneField = z
    .string()
    .min(1, "Thieu so dien thoai")
    .refine(isValidVnPhone, "So dien thoai khong hop le");
const passwordField = z
    .string()
    .min(6, "Mat khau phai co it nhat 6 ky tu");

export const zaloLoginSchema = z.object({
    accessToken: z.string().min(1, "Thieu accessToken"),
    zaloUserId: z.string().min(1, "Thieu zaloUserId"),
    name: z.string().optional(),
    avatarUrl: z.string().optional(),
    phone: z.string().optional(),
});
export type ZaloLoginInput = z.infer<typeof zaloLoginSchema>;

// displayName KHONG con trong danh sach nay - tu "danh tinh", chi sua duoc
// qua ChangeRequest sau khi duyet (xem changeRequestService.ts). email duoc
// them vao vi truoc gio field nay ton tai tren User nhung chua tung duoc noi
// vao endpoint tu-cap-nhat nay.
export const updateProfileSchema = z.object({
    phone: z.string().optional(),
    email: z.string().email("Email khong hop le").optional(),
    address: z.string().optional(),
    householdId: z.string().optional(),
    notificationPermission: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const phoneRegisterSchema = z.object({
    phone: phoneField,
    password: passwordField,
    displayName: z.string().min(1, "Thieu ho ten"),
});
export type PhoneRegisterInput = z.infer<typeof phoneRegisterSchema>;

export const phoneLoginSchema = z.object({
    phone: phoneField,
    password: z.string().min(1, "Thieu mat khau"),
});
export type PhoneLoginInput = z.infer<typeof phoneLoginSchema>;

// currentPassword bat buoc khi tai khoan da co mat khau (doi mat khau) - bo
// qua khi chua co (dat mat khau lan dau cho tai khoan dang nhap qua Zalo), xem
// authService.setPassword.
export const setPasswordSchema = z.object({
    currentPassword: z.string().optional(),
    password: passwordField,
});
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const otpRequestSchema = z.object({
    phone: phoneField,
    purpose: z.enum(OTP_PURPOSES),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
    phone: phoneField,
    purpose: z.enum(OTP_PURPOSES),
    code: z
        .string()
        .length(6, "Ma OTP phai gom 6 chu so")
        .regex(/^\d{6}$/, "Ma OTP phai gom 6 chu so"),
    displayName: z.string().min(1).optional(),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
