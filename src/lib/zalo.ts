import { createHash, createHmac, timingSafeEqual } from "crypto";
import { HttpError } from "@/lib/response";

const ZALO_ENV = process.env.ZALO_ENV || "sandbox";
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET;
// Khoa bi mat rieng cua Official Account gan voi Mini App (lay tu trang quan
// tri OA, KHAC voi ZALO_APP_SECRET cua Mini App o tren) - chi dung de xac thuc
// header X-ZEvent-Signature cua webhook, khong dung cho Graph API.
const ZALO_OA_SECRET_KEY = process.env.ZALO_OA_SECRET_KEY;

export type ZaloVerifiedProfile = {
    zaloUserId: string;
    name?: string;
    avatarUrl?: string;
    verifiedVia: "graph_api" | "sandbox";
};

/** Exchange the one-time getPhoneNumber token on the trusted server. */
export async function verifyZaloPhoneToken(
    accessToken: string,
    phoneToken?: string,
    sandboxPhone?: string,
): Promise<string | undefined> {
    if (ZALO_ENV !== "production") {
        return sandboxPhone ? normalizeZaloPhone(sandboxPhone) : undefined;
    }
    if (!phoneToken) return undefined;
    if (!ZALO_APP_SECRET) {
        throw new HttpError("Chua cau hinh xac thuc so dien thoai Zalo", 503);
    }

    const res = await fetch("https://graph.zalo.me/v2.0/me/info", {
        headers: {
            access_token: accessToken,
            code: phoneToken,
            secret_key: ZALO_APP_SECRET,
        },
    });
    const body = await res.json();
    const rawPhone = body?.data?.number;
    if (!res.ok || body?.error || !rawPhone) {
        throw new HttpError(
            "Khong the xac thuc so dien thoai tu Zalo, vui long thu lai",
            401,
        );
    }
    return normalizeZaloPhone(String(rawPhone));
}

function normalizeZaloPhone(value: string): string {
    const digits = value.replace(/\D/g, "");
    return digits.startsWith("84") && digits.length === 11
        ? `0${digits.slice(2)}`
        : digits;
}

/**
 * Xac thuc access token Zalo do client (zmp-sdk getAccessToken) gui len.
 *
 * - production: goi Zalo Graph API (`graph.zalo.me/v2.0/me`) de xac nhan accessToken
 *   thuc su thuoc ve zaloUserId duoc khai bao, tranh gia mao userId tu client.
 * - sandbox (mac dinh khi chua co ZALO_APP_ID/ZALO_APP_SECRET that): tin tuong
 *   thong tin client gui len. CHI dung cho dev/test, KHONG dung production.
 */
export async function verifyZaloAccessToken(
    accessToken: string,
    claimedZaloUserId: string,
    claimedProfile?: { name?: string; avatarUrl?: string },
): Promise<ZaloVerifiedProfile> {
    if (!accessToken || !claimedZaloUserId) {
        throw new HttpError("Thieu accessToken hoac zaloUserId", 422);
    }

    if (ZALO_ENV === "production") {
        if (!ZALO_APP_SECRET) {
            throw new HttpError("Chua cau hinh xac thuc Zalo production", 503);
        }
        // Tu 01/01/2024 Zalo Platform bat buoc gui appsecret_proof (HMAC-SHA256 cua accessToken,
        // dung app secret lam key) khi lay thong tin nguoi dung tu server, de xac nhan accessToken
        // thuc su duoc dung boi ung dung da dang ky (tuong tu appsecret_proof cua Facebook Graph API).
        const appsecretProof = createHmac("sha256", ZALO_APP_SECRET)
            .update(accessToken)
            .digest("hex");

        const url = new URL("https://graph.zalo.me/v2.0/me");
        url.searchParams.set("fields", "id,name,picture");
        const res = await fetch(url.toString(), {
            headers: {
                access_token: accessToken,
                appsecret_proof: appsecretProof,
            },
        });
        const data = await res.json();
        if (!res.ok || !data?.id) {
            throw new HttpError(
                "Xac thuc Zalo that bai, vui long dang nhap lai",
                401,
            );
        }
        if (String(data.id) !== String(claimedZaloUserId)) {
            throw new HttpError("Thong tin dang nhap Zalo khong khop", 401);
        }
        return {
            zaloUserId: String(data.id),
            name: data.name,
            avatarUrl: data.picture?.data?.url,
            verifiedVia: "graph_api",
        };
    }

    // Sandbox mode: dung cho local dev / ZMP dev tools khi chua dang ky Zalo App that.
    return {
        zaloUserId: claimedZaloUserId,
        name: claimedProfile?.name,
        avatarUrl: claimedProfile?.avatarUrl,
        verifiedVia: "sandbox",
    };
}

/**
 * Xac thuc header `X-ZEvent-Signature` cua webhook Zalo (OA/Mini App).
 *
 * Cong thuc theo Zalo: mac = SHA256(app_id + rawBody + timestamp + oaSecretKey)
 * - `rawBody` la chuoi JSON NGUYEN VAN Zalo gui (khong duoc parse/re-stringify
 *   lai, vi thu tu key/khoang trang khac di se lam sai lech hash), `app_id` va
 *   `timestamp` lay tu chinh field trong body do, `oaSecretKey` la "Khoa bi
 *   mat" cua Official Account gan voi Mini App (KHAC voi App Secret Key dung
 *   cho Graph API o verifyZaloAccessToken). Zalo dung SHA256 thuan, KHONG phai
 *   HMAC-SHA256 (khong dung secret lam key cho ham bam).
 *
 * ZALO_OA_SECRET_KEY chua cau hinh (vd: dang dev truoc khi co OA that) se lam
 * ham nay luon tra ve false - buoc phai cau hinh that truoc khi dua webhook
 * len production (xem validateZaloWebhookConfig trong lib/config.ts).
 */
export function verifyZaloWebhookSignature(
    rawBody: string,
    appId: string,
    timestamp: string,
    signatureHeader: string | null,
): boolean {
    if (!ZALO_OA_SECRET_KEY || !signatureHeader || !appId || !timestamp) {
        return false;
    }

    const expectedHex = createHash("sha256")
        .update(appId + rawBody + timestamp + ZALO_OA_SECRET_KEY)
        .digest("hex");
    const received = signatureHeader.startsWith("mac=")
        ? signatureHeader.slice("mac=".length)
        : signatureHeader;

    const expectedBuf = Buffer.from(expectedHex, "hex");
    const receivedBuf = Buffer.from(received, "hex");
    if (
        expectedBuf.length !== receivedBuf.length ||
        expectedBuf.length === 0
    ) {
        return false;
    }
    return timingSafeEqual(expectedBuf, receivedBuf);
}
