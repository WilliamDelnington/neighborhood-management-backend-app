const ESMS_ENDPOINT =
    "https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_get";

// CodeResult thuong gap (tai lieu eSMS: https://developers.esms.vn) - chi de
// log phia server cho de chan doan, KHONG bao gio dua vao response cho client.
const ESMS_CODE_MEANINGS: Record<string, string> = {
    "99": "Loi khong xac dinh - kiem tra lai tham so hoac lien he ho tro eSMS",
    "101": "Sai ApiKey/SecretKey",
    "102": "Tai khoan eSMS bi khoa",
    "103": "Khong du so du tai khoan eSMS",
    "104": "Brandname khong ton tai hoac bi huy (SmsType=2 can Brandname da duyet)",
    "118": "SmsType khong hop le",
    "124": "RequestId da ton tai (trung lap)",
    "132": "Chua duoc cap quyen dung dau so co dinh (SmsType=8) - lien he eSMS de kich hoat",
    "146": "Mau CSKH chua duoc dang ky (SmsType=2)",
};

export type EsmsSendResult = {
    ok: boolean;
    codeResult?: string;
    smsId?: string;
};

/**
 * Gui SMS qua eSMS.vn (SendMultipleMessage_V4_get). Tra ve { ok:false } thay
 * vi throw khi thieu config hoac eSMS bao loi, de otpDeliveryAdapter khong
 * lam sap luot yeu cau OTP - loi da duoc log phia server (xem ESMS_CODE_MEANINGS)
 * de chan doan ma khong lo thong tin ra response.
 */
export async function sendEsmsSms(
    phone: string,
    content: string,
): Promise<EsmsSendResult> {
    // Doc process.env trong ham (khong phai hang so top-level) - neu doc luc
    // import module thi voi cac script tu goi loadEnv() truoc (xem
    // scripts/test-esms.ts), gia tri se bi "dong bang" thanh undefined vi
    // import duoc hoist len truoc loadEnv() theo ngu nghia ESM/TS, giong ly do
    // isAuthOtpEnabled trong lib/config.ts cung phai la ham. Xem thao luan tai
    // https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import.
    const apiKey = process.env.ESMS_API_KEY;
    const secretKey = process.env.ESMS_SECRET_KEY;
    const smsType = process.env.ESMS_SMS_TYPE || "8";
    const brandname = process.env.ESMS_BRANDNAME;
    const sandbox = process.env.ESMS_SANDBOX === "true";

    if (!apiKey || !secretKey) {
        // eslint-disable-next-line no-console
        console.error("[esms] Thieu ESMS_API_KEY/ESMS_SECRET_KEY trong env");
        return { ok: false };
    }

    const params = new URLSearchParams({
        Phone: phone,
        Content: content,
        ApiKey: apiKey,
        SecretKey: secretKey,
        SmsType: smsType,
        IsUnicode: "0",
    });
    if (smsType === "2" && brandname) {
        params.set("Brandname", brandname);
    }
    if (sandbox) {
        params.set("Sandbox", "1");
    }

    try {
        const res = await fetch(`${ESMS_ENDPOINT}?${params.toString()}`);
        const body = await res.json();
        const codeResult = String(body?.CodeResult ?? "");
        if (codeResult !== "100") {
            // eslint-disable-next-line no-console
            console.error(
                `[esms] Gui SMS that bai, CodeResult=${codeResult}` +
                    (ESMS_CODE_MEANINGS[codeResult]
                        ? ` (${ESMS_CODE_MEANINGS[codeResult]})`
                        : ""),
            );
            return { ok: false, codeResult };
        }
        return { ok: true, codeResult, smsId: body?.SMSID };
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[esms] Loi goi API eSMS:", err);
        return { ok: false };
    }
}
