import { Notification, NotificationDelivery, User } from "@/models";
import { sendGmailEmail } from "@/lib/integrations/gmail";
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
/**
 * Kenh email (Gmail SMTP, xem lib/integrations/gmail.ts): goi TRUC TIEP, dong
 * bo, khong gop lai - CHI danh cho cac truong hop khan cap that su (xem ghi
 * chu "NGOAI LE" trong gmail.ts), khac voi chu dich "digest dinh ky" mac dinh
 * cua sendGmailEmail. Noi goi deliver() nay (vd createComplaint,
 * checkOverdueComplaintsAndNotify) chiu trach nhiem chi goi cho danh sach
 * target nho, xac dinh ro la khan cap.
 */
export const emailAdapter: NotificationChannelAdapter = {
    async deliver(targets) {
        if (targets.length === 0) return;

        const notificationIds = [
            ...new Set(targets.map(t => String(t.notificationId))),
        ];
        const userIds = [...new Set(targets.map(t => String(t.userId)))];

        const [notifications, users] = await Promise.all([
            Notification.find({ _id: { $in: notificationIds } }).select(
                "title body",
            ),
            User.find({ _id: { $in: userIds } }).select("email"),
        ]);
        const notificationById = new Map(
            notifications.map(n => [String(n._id), n]),
        );
        const emailByUserId = new Map(
            users.map(u => [String(u._id), u.email]),
        );

        for (const target of targets) {
            const notification = notificationById.get(
                String(target.notificationId),
            );
            const email = emailByUserId.get(String(target.userId));

            if (!email) {
                // eslint-disable-next-line no-await-in-loop
                await NotificationDelivery.create({
                    notificationId: target.notificationId,
                    userId: target.userId,
                    channel: "email",
                    failedAt: new Date(),
                    error: "Người dùng chưa có email trong hồ sơ",
                });
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            const result = await sendGmailEmail({
                to: email,
                subject: notification?.title || "Thông báo khẩn cấp",
                html: `<p>${notification?.body || ""}</p>`,
            });

            // eslint-disable-next-line no-await-in-loop
            await NotificationDelivery.create({
                notificationId: target.notificationId,
                userId: target.userId,
                channel: "email",
                sentAt: result.ok ? new Date() : undefined,
                failedAt: result.ok ? undefined : new Date(),
                error: result.ok ? undefined : "Gửi email qua Gmail thất bại",
            });
        }
    },
};

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
