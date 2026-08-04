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

/**
 * Ten database duoc coi la du lieu that (production) - cac script ghi/xoa
 * hang loat (seed*, create-proposal-accounts...) tu choi chay neu MONGODB_URI
 * dang tro vao day, BAT KE NODE_ENV dat gi. Bo sung doc lap voi kiem tra
 * NODE_ENV=production (vd assertNotProduction trong scripts/seed.ts): nguyen
 * nhan accident mat du lieu truoc day khong phai NODE_ENV sai, ma la may dev
 * tro thang MONGODB_URI vao database production (khong co database rieng cho
 * dev), nen kiem tra NODE_ENV khong the bat duoc truong hop nay.
 */
const PROTECTED_DB_NAMES = ["to-dan-hoa-binh"];

/**
 * Lay ten database tu chuoi ket noi MongoDB. Khong dung WHATWG URL de parse vi
 * chuoi khong-SRV cua Atlas liet ke nhieu host truc tiep trong authority
 * (shard-00-00,shard-00-01,shard-00-02) ma URL chuan khong parse duoc.
 */
export function extractDbNameFromMongoUri(uri: string): string {
    const withoutQuery = uri.split("?")[0];
    const afterScheme = withoutQuery.replace(/^mongodb(\+srv)?:\/\//, "");
    const afterCredentials = afterScheme.includes("@")
        ? afterScheme.slice(afterScheme.lastIndexOf("@") + 1)
        : afterScheme;
    const slashIndex = afterCredentials.indexOf("/");
    return slashIndex === -1 ? "" : afterCredentials.slice(slashIndex + 1);
}

/**
 * Chan cung mot script ghi/xoa hang loat neu MONGODB_URI dang tro vao database
 * production (xem PROTECTED_DB_NAMES). Goi truoc khi ket noi, ngay sau
 * loadEnv().
 */
export function assertNotProtectedDatabase(uri: string): void {
    const dbName = extractDbNameFromMongoUri(uri);
    if (PROTECTED_DB_NAMES.includes(dbName)) {
        throw new Error(
            `Tu choi chay: MONGODB_URI dang tro vao database "${dbName}", ` +
                "day la database du lieu that (production) - khong duoc phep " +
                "chay script ghi/xoa hang loat nham vao day. Neu day thuc su la " +
                `moi truong dev, doi ten database trong MONGODB_URI (vd "${dbName}-dev") ` +
                "trong .env.local - xem phan Cau hinh bien moi truong trong README.",
        );
    }
}
