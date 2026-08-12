const ESMS_ZNS_ENDPOINT =
    "https://rest.esms.vn/MainService.svc/json/SendZaloMessage_V6/";

// CodeResult rieng cho ZNS (tai lieu:
// https://developers.esms.vn/esms-api/ham-gui-tin/tin-nhan-zalo) - chi de log
// phia server cho de chan doan, KHONG bao gio dua vao response cho client.
const ESMS_ZNS_CODE_MEANINGS: Record<string, string> = {
    "99": "Loi khong xac dinh - kiem tra lai tham so hoac lien he ho tro eSMS",
    "101": "Sai ApiKey/SecretKey",
    "789": "TemplateId chua duoc cau hinh cho OAID nay - lien he eSMS de gan TempID vao OA",
};

export type EsmsZnsSendResult = {
    ok: boolean;
    codeResult?: string;
    smsId?: string;
};

/**
 * Gui OTP qua Zalo ZNS (SendZaloMessage_V6) thay vi SMS thuong - dung khi da
 * co OA da xac thuc + mau OTP da duoc Zalo duyet + TempID da duoc eSMS gan vao
 * OAID (xem ESMS_ZALO_OA_ID/ESMS_ZALO_TEMPLATE_ID trong .env). Khong bi loc
 * boi nha mang nhu SMS dau so co dinh (SmsType=8) vi gui qua app Zalo, khong
 * qua kenh SMS vien thong.
 */
export async function sendEsmsZns(
    phone: string,
    code: string,
): Promise<EsmsZnsSendResult> {
    // Doc process.env trong ham, khong phai hang so top-level - xem giai
    // thich cung ly do trong lib/esms.ts (import hoisting lam "dong bang"
    // gia tri undefined doi voi cac script tu goi loadEnv() truoc).
    const apiKey = process.env.ESMS_API_KEY;
    const secretKey = process.env.ESMS_SECRET_KEY;
    const oaId = process.env.ESMS_ZALO_OA_ID;
    const tempId = process.env.ESMS_ZALO_TEMPLATE_ID;
    // Ten bien trong mau ZNS OTP do Zalo/eSMS cap khi tao mau - co the khac
    // "otp" tuy mau thuc te, chinh lai trong .env cho khop sau khi tao mau.
    const tempDataKey = process.env.ESMS_ZALO_TEMPLATE_DATA_KEY || "otp";
    const sandbox = process.env.ESMS_SANDBOX === "true";

    if (!apiKey || !secretKey || !oaId || !tempId) {
        // eslint-disable-next-line no-console
        console.error(
            "[esms-zns] Thieu ESMS_API_KEY/ESMS_SECRET_KEY/ESMS_ZALO_OA_ID/ESMS_ZALO_TEMPLATE_ID trong env",
        );
        return { ok: false };
    }

    const body: Record<string, unknown> = {
        ApiKey: apiKey,
        SecretKey: secretKey,
        OAID: oaId,
        Phone: phone,
        TempID: tempId,
        TempData: { [tempDataKey]: code },
    };
    if (sandbox) {
        body.Sandbox = "1";
    }

    try {
        const res = await fetch(ESMS_ZNS_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const responseBody = await res.json();
        const codeResult = String(responseBody?.CodeResult ?? "");
        if (codeResult !== "100") {
            // eslint-disable-next-line no-console
            console.error(
                `[esms-zns] Gui ZNS that bai, CodeResult=${codeResult}` +
                    (ESMS_ZNS_CODE_MEANINGS[codeResult]
                        ? ` (${ESMS_ZNS_CODE_MEANINGS[codeResult]})`
                        : ""),
            );
            return { ok: false, codeResult };
        }
        return { ok: true, codeResult, smsId: responseBody?.SMSID };
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[esms-zns] Loi goi API ZNS:", err);
        return { ok: false };
    }
}
