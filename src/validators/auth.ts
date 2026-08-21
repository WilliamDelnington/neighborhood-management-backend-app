import { z } from "zod";
import { isValidVnPhone } from "@/lib/phone";

const phoneField = z
    .string()
    .min(1, "Thiếu số điện thoại")
    .refine(isValidVnPhone, "Số điện thoại không hợp lệ");
const passwordField = z
    .string()
    .min(6, "Mật khẩu phải có ít nhất 6 ký tự");

export const zaloLoginSchema = z.object({
    accessToken: z.string().min(1, "Thiếu accessToken"),
    zaloUserId: z.string().min(1, "Thiếu zaloUserId"),
    name: z.string().optional(),
    avatarUrl: z.string().optional(),
    // One-time token returned by zmp-sdk getPhoneNumber. Production must
    // never trust a plain phone number supplied by the client.
    phoneToken: z.string().optional(),
    // Sandbox-only helper for automated/local testing.
    phone: z.string().optional(),
});
export type ZaloLoginInput = z.infer<typeof zaloLoginSchema>;

// displayName KHONG con trong danh sach nay - tu "danh tinh", chi sua duoc
// qua ChangeRequest sau khi duyet (xem changeRequestService.ts). email duoc
// them vao vi truoc gio field nay ton tai tren User nhung chua tung duoc noi
// vao endpoint tu-cap-nhat nay. phone CUNG KHONG con trong danh sach nay -
// day la thong tin dang nhap (xem phoneLoginSchema), doi truc tiep khong xac
// thuc la mot lo hong - phai di qua changePhoneSchema/changeOwnPhone (xac
// thuc lai qua Zalo getPhoneNumber, xem app/api/auth/change-phone).
export const updateProfileSchema = z.object({
    email: z.string().email("Email không hợp lệ").optional(),
    address: z.string().optional(),
    householdId: z.string().optional(),
    notificationPermission: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Doi so dien thoai dang nhap - cung tham so voi zaloLoginSchema (accessToken
// + phoneToken mot-lan-dung tu zmp-sdk getPhoneNumber), KHONG nhan phone tho
// tu client o production (xem lib/zalo.ts verifyZaloPhoneToken).
export const changePhoneSchema = z.object({
    accessToken: z.string().min(1, "Thiếu accessToken"),
    phoneToken: z.string().optional(),
    // Sandbox-only helper for automated/local testing.
    phone: z.string().optional(),
});
export type ChangePhoneInput = z.infer<typeof changePhoneSchema>;

export const phoneRegisterSchema = z.object({
    phone: phoneField,
    password: passwordField,
    displayName: z.string().min(1, "Thiếu họ tên"),
});
export type PhoneRegisterInput = z.infer<typeof phoneRegisterSchema>;

export const phoneLoginSchema = z.object({
    phone: phoneField,
    password: z.string().min(1, "Thiếu mật khẩu"),
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

// purpose (login/register) KHONG con nam trong 2 schema duoi - truoc day
// nhan tu client co the bi dung de do tim so dien thoai da dang ky hay chua
// (xem docstring requestOtp/verifyOtpAndAuthenticate); server tu quyet dinh
// dua vao viec tai khoan da ton tai hay chua.
export const otpRequestSchema = z.object({
    phone: phoneField,
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
    phone: phoneField,
    code: z
        .string()
        .length(6, "Mã OTP phải gồm 6 chữ số")
        .regex(/^\d{6}$/, "Mã OTP phải gồm 6 chữ số"),
    displayName: z.string().min(1).optional(),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
