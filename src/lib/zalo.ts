import { createHmac } from "crypto";
import { HttpError } from "@/lib/response";

const ZALO_ENV = process.env.ZALO_ENV || "sandbox";
const ZALO_APP_SECRET = process.env.ZALO_APP_SECRET;

export type ZaloVerifiedProfile = {
    zaloUserId: string;
    name?: string;
    avatarUrl?: string;
    verifiedVia: "graph_api" | "sandbox";
};

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

    if (ZALO_ENV === "production" && ZALO_APP_SECRET) {
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
