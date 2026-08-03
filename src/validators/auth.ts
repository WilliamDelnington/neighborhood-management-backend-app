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

export const updateProfileSchema = z.object({
    displayName: z.string().min(1).optional(),
    phone: z.string().optional(),
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

export const setPasswordSchema = z.object({
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
