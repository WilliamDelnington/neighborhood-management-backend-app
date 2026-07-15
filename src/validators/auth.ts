import { z } from "zod";
import { isValidVnPhone } from "@/lib/phone";

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

export const phoneLoginSchema = z.object({
    phone: z.string().min(1, "Thieu so dien thoai"),
    password: z.string().min(1, "Thieu mat khau"),
});
export type PhoneLoginInput = z.infer<typeof phoneLoginSchema>;

export const setPasswordSchema = z.object({
    password: z.string().min(6, "Mat khau phai co it nhat 6 ky tu"),
    currentPassword: z.string().optional(),
});
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

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
