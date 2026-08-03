import crypto from "crypto";
import { User, OtpChallenge, type IUser, type OtpPurpose } from "@/models";
import { HttpError } from "@/lib/response";
import { signSessionToken, hashPassword, comparePassword } from "@/lib/auth";
import {
    normalizePhone,
    hashForLookup,
    maskPhone,
} from "@/lib/encryption";
import { otpRequestRateLimiter, otpVerifyRateLimiter } from "@/lib/rateLimit";
import { writeAuditLog } from "@/services/auditService";
import { sanitizeUserWithPermissions } from "@/services/authService";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_CODE_LENGTH = 6;

function generateOtpCode(): string {
    return String(crypto.randomInt(0, 10 ** OTP_CODE_LENGTH)).padStart(
        OTP_CODE_LENGTH,
        "0",
    );
}

export type OtpDeliveryAdapter = {
    send(phone: string, code: string): Promise<{ ok: boolean }>;
};

/**
 * Stub: chua co nha cung cap SMS/Zalo ZNS that duoc tich hop (can dang ky va
 * duoc duyet). Khi co day du:
 * 1. Doi cac bien env cua nha cung cap da chon vao .env.
 * 2. Goi API gui SMS/ZNS that voi phone + code.
 * 3. Tra ve { ok:false } thay vi throw neu gui that bai, de requestOtp co the
 *    quyet dinh co bao loi cho nguoi dung hay khong ma khong lam lo thong tin.
 * Ngoai production, log ma ra console de tien test local (khong bao gio log
 * o production, va khong bao gio log so dien thoai o dang chua che).
 */
export const otpDeliveryAdapter: OtpDeliveryAdapter = {
    async send(phone, code) {
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.log(`[otp-stub] Ma OTP cho ${maskPhone(phone)}: ${code}`);
            return { ok: true };
        }
        // eslint-disable-next-line no-console
        console.error(
            "[otp-stub] Chua tich hop nha cung cap SMS/Zalo ZNS - khong the gui OTP that",
        );
        return { ok: false };
    },
};

/**
 * Tao va "gui" mot ma OTP moi cho (phone, purpose). Khong tiet lo qua ket qua
 * tra ve viec so dien thoai da dang ky hay chua: neu trang thai khong phu hop
 * (purpose=register nhung so da dang ky, hoac purpose=login nhung chua co tai
 * khoan), vAn tra ve nhu thanh cong nhung KHONG tao challenge / KHONG gui OTP -
 * tranh do tim so dien thoai da dang ky. `code` trong gia tri tra ve CHI danh
 * cho test goi truc tiep ham service (khong qua HTTP) - route KHONG BAO GIO
 * duoc dua truong nay vao response.
 */
export async function requestOtp(
    phone: string,
    purpose: OtpPurpose,
): Promise<{ code: string }> {
    const normalized = normalizePhone(phone);
    otpRequestRateLimiter.check(`${purpose}:${normalized}`);

    const existing = await User.findOne({ phone: normalized }).select("_id");
    if (purpose === "register" && existing) return { code: "" };
    if (purpose === "login" && !existing) return { code: "" };

    const phoneHash = hashForLookup(normalized);
    const code = generateOtpCode();
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Huy cac challenge dang cho cua cung (phone, purpose) - chi cho phep mot
    // ma hieu luc tai mot thoi diem, tranh nham lan ma cu/ma moi.
    await OtpChallenge.deleteMany({
        phoneHash,
        purpose,
        consumedAt: { $exists: false },
    });
    await OtpChallenge.create({ phoneHash, codeHash, purpose, expiresAt });

    await otpDeliveryAdapter.send(normalized, code);

    return { code };
}

/**
 * Xac thuc ma OTP roi dang nhap (purpose=login, tai khoan phai da ton tai)
 * hoac dang ky (purpose=register, tao tai khoan moi neu so dien thoai chua
 * duoc dung) - gop xac thuc + phat phien trong mot buoc, giong loginWithZalo.
 */
export async function verifyOtpAndAuthenticate(
    phone: string,
    purpose: OtpPurpose,
    code: string,
    displayName?: string,
) {
    const normalized = normalizePhone(phone);
    otpVerifyRateLimiter.check(`${purpose}:${normalized}`);

    const phoneHash = hashForLookup(normalized);
    const challenge = await OtpChallenge.findOne({
        phoneHash,
        purpose,
        consumedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!challenge) {
        throw new HttpError("Ma OTP khong hop le hoac da het han", 401);
    }
    if (challenge.attempts >= challenge.maxAttempts) {
        throw new HttpError(
            "Ban da nhap sai qua nhieu lan, vui long yeu cau ma moi",
            429,
        );
    }

    const matches = await comparePassword(code, challenge.codeHash);
    if (!matches) {
        challenge.attempts += 1;
        await challenge.save();
        throw new HttpError("Ma OTP khong dung", 401);
    }

    challenge.consumedAt = new Date();
    await challenge.save();

    let user: IUser | null;
    if (purpose === "login") {
        user = await User.findOne({ phone: normalized });
        if (!user) throw new HttpError("Khong tim thay tai khoan", 401);
        if (user.status === "locked") {
            throw new HttpError("Tai khoan da bi khoa", 401);
        }
        user.lastLoginAt = new Date();
        await user.save();
    } else {
        const existingUser = await User.findOne({ phone: normalized });
        if (existingUser) {
            throw new HttpError("So dien thoai da duoc su dung", 409);
        }
        user = await User.create({
            phone: normalized,
            displayName: displayName || "Nguoi dung",
            roles: ["house_owner"],
            primaryRole: "house_owner",
            status: "active",
        });
    }

    const token = signSessionToken({
        userId: String(user._id),
        primaryRole: user.primaryRole,
        roles: user.roles,
        sv: user.sessionVersion,
    });

    await writeAuditLog({
        actorId: user._id,
        action: purpose === "login" ? "auth.login.otp" : "auth.register.otp",
        targetModel: "User",
        targetId: user._id,
    });

    return { token, user: await sanitizeUserWithPermissions(user) };
}
