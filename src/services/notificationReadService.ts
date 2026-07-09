import { NotificationDelivery } from "@/models";
import { HttpError } from "@/lib/response";

/**
 * Danh sach thong bao (NotificationDelivery) cua chinh nguoi dung dang dang nhap,
 * kem thong tin Notification lien quan (tieu de, noi dung, loai, doi tuong lien quan).
 */
export async function listMyNotifications(
    userId: string,
    params: { page: number; limit: number; unreadOnly?: boolean },
) {
    const { page, limit, unreadOnly } = params;
    const filter: Record<string, unknown> = { userId };
    if (unreadOnly) filter.readAt = null;

    const [deliveries, total] = await Promise.all([
        NotificationDelivery.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("notificationId"),
        NotificationDelivery.countDocuments(filter),
    ]);

    const items = deliveries.map(delivery => ({
        deliveryId: delivery._id,
        notification: delivery.notificationId,
        readAt: delivery.readAt,
        sentAt: delivery.sentAt,
    }));

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

/**
 * So thong bao chua doc cua nguoi dung dang dang nhap (dung cho badge tren chuong thong bao).
 */
export async function getUnreadCount(
    userId: string,
): Promise<{ count: number }> {
    const count = await NotificationDelivery.countDocuments({
        userId,
        readAt: null,
    });
    return { count };
}

/**
 * Danh dau mot NotificationDelivery la da doc. Bat buoc kiem tra quyen so huu
 * (userId trung khop) de nguoi dung khong the danh dau thong bao cua nguoi khac.
 */
export async function markAsRead(userId: string, deliveryId: string) {
    const delivery = await NotificationDelivery.findOneAndUpdate(
        { _id: deliveryId, userId },
        { readAt: new Date() },
        { new: true },
    );
    if (!delivery) {
        throw new HttpError(
            "Khong tim thay thong bao hoac ban khong co quyen truy cap",
            404,
        );
    }
    return delivery;
}

/**
 * Danh dau toan bo thong bao chua doc cua nguoi dung dang dang nhap la da doc.
 */
export async function markAllAsRead(
    userId: string,
): Promise<{ modifiedCount: number }> {
    const result = await NotificationDelivery.updateMany(
        { userId, readAt: null },
        { readAt: new Date() },
    );
    return { modifiedCount: result.modifiedCount };
}
