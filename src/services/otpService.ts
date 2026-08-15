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
import { sendEsmsSms } from "@/lib/esms";
import { sendEsmsZns } from "@/lib/esmsZns";

// 12 phut - du thoi gian cho nguoi dung nhan va nhap ma trong cac thao tac
// mat nhieu thoi gian (vd doi tin nhan SMS/ZNS bi cham), truoc day 5 phut
// qua ngan gay het han ma OTP khi nguoi dung con dang thao tac.
const OTP_TTL_MS = 12 * 60 * 1000;
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
 * Gui OTP qua Zalo ZNS neu da cau hinh du ESMS_ZALO_OA_ID/ESMS_ZALO_TEMPLATE_ID
 * (xem lib/esmsZns.ts) - uu tien hon SMS thuong vi khong bi nha mang loc nhu
 * SMS dau so co dinh (SmsType=8). Neu chua co ZNS, roi ve eSMS SMS thuong neu
 * da cau hinh ESMS_API_KEY/ESMS_SECRET_KEY (xem lib/esms.ts); neu chua co ca
 * hai, roi lai stub cu: log ma ra console ngoai production de tien test
 * local, tra ve { ok:false } o production (khong bao gio log o production, va
 * khong bao gio log so dien thoai o dang chua che).
 */
export const otpDeliveryAdapter: OtpDeliveryAdapter = {
    async send(phone, code) {
        if (
            process.env.ESMS_API_KEY &&
            process.env.ESMS_SECRET_KEY &&
            process.env.ESMS_ZALO_OA_ID &&
            process.env.ESMS_ZALO_TEMPLATE_ID
        ) {
            const result = await sendEsmsZns(phone, code);
            if (process.env.NODE_ENV !== "production") {
                // eslint-disable-next-line no-console
                console.log(
                    `[otp-zns] Gui OTP toi ${maskPhone(phone)}: ${
                        result.ok
                            ? "OK"
                            : `LOI (CodeResult=${result.codeResult ?? "?"})`
                    } - ma: ${code}`,
                );
            }
            return result;
        }
        if (process.env.ESMS_API_KEY && process.env.ESMS_SECRET_KEY) {
            const content = `Ma xac thuc cua ban la: ${code}. Khong chia se ma nay cho bat ky ai.`;
            const result = await sendEsmsSms(phone, content);
            if (process.env.NODE_ENV !== "production") {
                // eslint-disable-next-line no-console
                console.log(
                    `[otp-esms] Gui OTP toi ${maskPhone(phone)}: ${
                        result.ok
                            ? "OK"
                            : `LOI (CodeResult=${result.codeResult ?? "?"})`
                    } - ma: ${code}`,
                );
            }
            return result;
        }
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
 * Tao va gui mot ma OTP moi cho so dien thoai - KHONG nhan purpose tu client
 * nua (truoc day co the bi dung de do tim so da dang ky hay chua, xem lich su
 * git). Server tu quyet dinh purpose dua vao viec tai khoan da ton tai hay
 * chua (login neu co, register neu chua) va LUON tao challenge + gui OTP thuc
 * trong ca hai truong hop - client khong the phan biet duoc hai truong hop nay
 * qua response, nen khong con do tim duoc so dien thoai da dang ky. `code`
 * trong gia tri tra ve CHI danh cho test goi truc tiep ham service (khong qua
 * HTTP) - route KHONG BAO GIO duoc dua truong nay vao response.
 */
export async function requestOtp(phone: string): Promise<{ code: string }> {
    const normalized = normalizePhone(phone);
    otpRequestRateLimiter.check(normalized);

    const existing = await User.findOne({ phone: normalized }).select("_id");
    const purpose: OtpPurpose = existing ? "login" : "register";

    const phoneHash = hashForLookup(normalized);
    const code = generateOtpCode();
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Huy cac challenge dang cho cua cung so dien thoai (bat ke purpose cu) -
    // chi cho phep mot ma hieu luc tai mot thoi diem, tranh nham lan ma cu/moi.
    await OtpChallenge.deleteMany({
        phoneHash,
        consumedAt: { $exists: false },
    });
    await OtpChallenge.create({ phoneHash, codeHash, purpose, expiresAt });

    await otpDeliveryAdapter.send(normalized, code);

    return { code };
}

/**
 * Xac thuc ma OTP roi dang nhap hoac dang ky - KHONG nhan purpose tu client,
 * doc lai tu chinh challenge da tao luc requestOtp (server tu quyet dinh, xem
 * docstring requestOtp) de dam bao hanh vi khop voi luc gui ma, du tai khoan
 * co the da duoc tao/xoa giua luc gui ma va luc xac thuc.
 */
export async function verifyOtpAndAuthenticate(
    phone: string,
    code: string,
    displayName?: string,
) {
    const normalized = normalizePhone(phone);
    otpVerifyRateLimiter.check(normalized);

    const phoneHash = hashForLookup(normalized);
    const challenge = await OtpChallenge.findOne({
        phoneHash,
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
    const purpose = challenge.purpose;

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
