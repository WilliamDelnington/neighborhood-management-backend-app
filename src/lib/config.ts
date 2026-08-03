/**
 * Cau hinh xac thuc doc tu env, tap trung mot noi thay vi rai rac (giong
 * ZALO_ENV trong lib/zalo.ts). AUTH_OTP_ENABLED=true bat /api/auth/otp/* (dang
 * nhap/dang ky bang OTP); false (mac dinh) hai route do tra ve 404, dang
 * nhap/dang ky bang mat khau (login/register hien co) khong doi hanh vi.
 *
 * Ham (khong phai hang so top-level) de doc process.env moi lan goi - can
 * thiet cho test: bo test suite chay chung mot tien trinh (xem tests/setup.ts,
 * pool "forks" + isolate:false), neu doc mot lan luc import va luu vao hang so
 * thi gia tri se bi "dong bang" theo file test dau tien import module nay,
 * khong the bat/tat AUTH_OTP_ENABLED giua cac test khac nhau duoc nua.
 */
export function isAuthOtpEnabled(): boolean {
    return process.env.AUTH_OTP_ENABLED === "true";
}

/**
 * Nem loi ngay luc khoi dong (goi tu instrumentation.ts) neu cau hinh OTP
 * khong an toan de chay production - tranh truong hop AUTH_OTP_ENABLED=true
 * nhung chua co nha cung cap SMS/Zalo ZNS that (OtpDeliveryAdapter hien chi la
 * stub, xem services/otpService.ts) ma khong ai phat hien cho den luot nguoi
 * dung dau tien yeu cau OTP.
 */
export function validateAuthConfig(): void {
    if (
        process.env.NODE_ENV === "production" &&
        isAuthOtpEnabled() &&
        !process.env.OTP_PROVIDER_CONFIGURED
    ) {
        throw new Error(
            "AUTH_OTP_ENABLED=true yeu cau cau hinh nha cung cap OTP " +
                "(dat OTP_PROVIDER_CONFIGURED=true sau khi tich hop that) " +
                "truoc khi chay production",
        );
    }
}

/**
 * Nem loi ngay luc khoi dong neu webhook Zalo (/api/webhooks/zalo) khong the
 * xac thuc chu ky trong production - thieu ZALO_OA_SECRET_KEY se khien
 * verifyZaloWebhookSignature luon tra ve false, tuc moi request (ke ca that
 * tu Zalo) deu bi tu choi voi 401, mini app se khong bao gio nhan duoc su
 * kien rut lai su dong y/xoa du lieu ma khong ai phat hien ra.
 */
export function validateZaloWebhookConfig(): void {
    if (
        process.env.NODE_ENV === "production" &&
        !process.env.ZALO_OA_SECRET_KEY
    ) {
        throw new Error(
            "Thieu ZALO_OA_SECRET_KEY - can thiet de xac thuc webhook Zalo " +
                "(/api/webhooks/zalo) truoc khi chay production",
        );
    }
}
