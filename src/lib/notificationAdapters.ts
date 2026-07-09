import { NotificationDelivery } from "@/models";
import type { Types } from "mongoose";

export type DeliveryTarget = {
    notificationId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
};

export interface NotificationChannelAdapter {
    deliver(targets: DeliveryTarget[]): Promise<void>;
}

/**
 * Kenh in-app: tao NotificationDelivery cho tung user, hien thi trong "Trung tam thong bao"
 * cua Mini App. Day la kenh duy nhat hoat dong that o giai doan nay.
 */
export const inAppAdapter: NotificationChannelAdapter = {
    async deliver(targets) {
        if (targets.length === 0) return;
        await NotificationDelivery.insertMany(
            targets.map(t => ({
                notificationId: t.notificationId,
                userId: t.userId,
                channel: "in_app",
                sentAt: new Date(),
            })),
        );
    },
};

/**
 * Kenh Zalo OA (day thong bao qua Official Account): CHUA trien khai that vi can
 * OA ID + template da duyet + quyen gui tin cua Zalo. Khi co day du:
 * 1. Doi ZALO_OA_ID / ZALO_OA_ACCESS_TOKEN vao env.
 * 2. Goi Zalo OA Message API (POST https://openapi.zalo.me/v3.0/oa/message/cs)
 *    voi user_id (Zalo ID) va noi dung thong bao.
 * 3. Ghi NotificationDelivery voi channel = "zalo_oa_future", sentAt/failedAt tuong ung.
 * Hien tai chi ghi nhan "failed" de khong lam sai lech thong ke, khong throw loi.
 */
export const zaloOaAdapter: NotificationChannelAdapter = {
    async deliver(targets) {
        if (targets.length === 0) return;
        await NotificationDelivery.insertMany(
            targets.map(t => ({
                notificationId: t.notificationId,
                userId: t.userId,
                channel: "zalo_oa_future",
                failedAt: new Date(),
                error: "TODO: chua tich hop Zalo OA Message API - can OA credentials duoc duyet",
            })),
        );
    },
};
