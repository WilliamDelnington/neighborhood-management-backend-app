import { ZaloWebhookEvent, type IZaloWebhookEvent } from "@/models";

/**
 * Cac ten su kien (event_name) co the tuong ung voi viec nguoi dung Zalo thuc
 * hien quyen chu the du lieu (rut lai su dong y / yeu cau xoa du lieu) - theo
 * yeu cau xet duyet Mini App. Tai lieu cong khai cua Zalo (tinh den luc viet
 * code nay) KHONG liet ke ro gia tri chinh xac cua event_name cho su kien nay,
 * nen day chi la danh sach du doan hop ly + fallback theo tu khoa ben duoi
 * (xem looksLikeDataSubjectRightsEvent). Khi Zalo thuc su goi webhook nay (co
 * the kich hoat bang nut "Kiem tra"/"Test" o trang quan tri OA/Mini App sau
 * khi dang ky URL), hay xem lai payload da luu trong ZaloWebhookEvent va cap
 * nhat danh sach nay cho chinh xac.
 */
const KNOWN_DATA_SUBJECT_RIGHTS_EVENT_NAMES = [
    "user_data_request",
    "user_withdraw_consent",
    "user_request_data_deletion",
    "oa_user_data_deletion_request",
];

export function looksLikeDataSubjectRightsEvent(eventName: string): boolean {
    const normalized = eventName.toLowerCase();
    if (KNOWN_DATA_SUBJECT_RIGHTS_EVENT_NAMES.includes(normalized)) {
        return true;
    }
    return (
        normalized.includes("consent") ||
        normalized.includes("data_request") ||
        normalized.includes("data_deletion") ||
        normalized.includes("delete_data") ||
        normalized.includes("chu_the_du_lieu")
    );
}

/**
 * Luu lai moi request Zalo goi den webhook - ke ca chu ky khong hop le - de co
 * nhat ky day du phuc vu doi soat/go loi, khong phu thuoc vao viec da nhan
 * dien dung loai su kien hay chua.
 */
export async function recordWebhookEvent(params: {
    appId: string;
    eventName: string;
    payload: Record<string, unknown>;
    signatureValid: boolean;
}): Promise<IZaloWebhookEvent> {
    return ZaloWebhookEvent.create(params);
}
