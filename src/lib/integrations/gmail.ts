import nodemailer from "nodemailer";

export type SendGmailEmailResult = { ok: boolean };

export interface SendGmailEmailParams {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

/**
 * Gui email qua Gmail SMTP (tai khoan Gmail thuong + "App password", KHONG
 * phai OAuth2 - don gian nhat cho quy mo he thong nay, khong can flow xin
 * quyen rieng). Day la KENH THU HAI (sau in-app, xem lib/notificationAdapters.ts) -
 * mac dinh chi danh cho luong "digest" thong bao dinh ky (gop nhieu thong bao
 * cua CUNG mot nguoi nhan thanh MOT email), KHONG duoc goi truc tiep moi khi
 * co 1 thong bao moi phat sinh - lam vay se spam hop thu nguoi nhan neu ho
 * quan ly nhieu Nha/Ho (vd mot to truong nhan hang tram xac nhan cung luc).
 * Noi goi ham nay (job dinh ky) chiu trach nhiem tu gop noi dung truoc khi goi.
 *
 * NGOAI LE duy nhat: emailAdapter (notificationAdapters.ts) goi truc tiep,
 * dong bo, khong gop - CHI cho cac truong hop khan cap that su duoc liet ke ro
 * (phan anh an_ninh_trat_tu/pccc khi tao, va canh bao phan anh qua han 24h,
 * xem checkOverdueComplaintsAndNotify trong complaintService.ts). So luong cac
 * truong hop nay nho va hiem nen chap nhan duoc rui ro spam nguoc lai loi ich
 * bao khan cap kip thoi.
 *
 * Cau hinh: bat "2-Step Verification" cho tai khoan Gmail dung de gui, sau do
 * tao "App password" tai https://myaccount.google.com/apppasswords (KHAC mat
 * khau dang nhap Gmail thuong - mat khau dang nhap se KHONG hoat dong voi
 * SMTP neu tai khoan da bat 2FA) - dan vao GMAIL_APP_PASSWORD.
 *
 * Doc process.env trong ham (khong phai hang so top-level) - cung ly do voi
 * lib/esms.ts (test can doi env giua cac test case, gia tri khong duoc "dong
 * bang" luc import module).
 */
export async function sendGmailEmail(
    params: SendGmailEmailParams,
): Promise<SendGmailEmailResult> {
    const user = process.env.GMAIL_USER;
    const appPassword = process.env.GMAIL_APP_PASSWORD;

    if (!user || !appPassword) {
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.log(
                `[gmail-stub] Chua cau hinh GMAIL_USER/GMAIL_APP_PASSWORD - se gui email toi ${params.to}: "${params.subject}"`,
            );
            return { ok: true };
        }
        // eslint-disable-next-line no-console
        console.error(
            "[gmail] Thieu GMAIL_USER/GMAIL_APP_PASSWORD trong env - khong the gui email",
        );
        return { ok: false };
    }

    const fromName = process.env.GMAIL_FROM_NAME || "Quản lý Tổ dân phố";

    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user, pass: appPassword },
        });
        await transporter.sendMail({
            from: `"${fromName}" <${user}>`,
            to: params.to,
            subject: params.subject,
            html: params.html,
            text: params.text,
        });
        return { ok: true };
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[gmail] Gui email toi ${params.to} that bai:`, err);
        return { ok: false };
    }
}
