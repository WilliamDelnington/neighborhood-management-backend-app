import { NotificationDelivery } from "@/models";
import { HttpError } from "@/lib/response";
import { emitUnreadCount } from "@/lib/socket";

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
 * Tap hop id ban ghi (relatedId) ma nguoi dung CO thong bao chua doc, gioi
 * han theo Notification.relatedModel (vd "Correspondence") - dung chung cho
 * ca so dem badge tren menu (getUnreadCountByRelatedModel) lan danh dau tung
 * dong trong danh sach la "chua doc" (vd listCorrespondences). Loc bang
 * populate + filter thay vi aggregation $lookup vi so luong thong bao chua
 * doc cua 1 nguoi dung thuong nho, khong dang gia them do phuc tap.
 */
export async function getUnreadRelatedIds(
    userId: string,
    relatedModel: string,
): Promise<Set<string>> {
    const deliveries = await NotificationDelivery.find({
        userId,
        readAt: null,
    }).populate({ path: "notificationId", select: "relatedModel relatedId" });

    const ids = new Set<string>();
    for (const d of deliveries) {
        const n = d.notificationId as unknown as {
            relatedModel?: string;
            relatedId?: unknown;
        } | null;
        if (n?.relatedModel === relatedModel && n.relatedId) {
            ids.add(String(n.relatedId));
        }
    }
    return ids;
}

/**
 * So thong bao CHUA DOC cua nguoi dung, gioi han theo Notification.relatedModel
 * (vd "Correspondence") - dung cho badge so luong rieng cho tung muc menu
 * (vd "Văn bản") thay vi so tong hop tren chuong thong bao.
 */
export async function getUnreadCountByRelatedModel(
    userId: string,
    relatedModel: string,
): Promise<number> {
    const ids = await getUnreadRelatedIds(userId, relatedModel);
    return ids.size;
}

/**
 * Danh dau CAC thong bao chua doc cua 1 nguoi dung ung voi 1 ban ghi cu the
 * (relatedModel + relatedId) la da doc - dung khi nguoi dung MO trang chi
 * tiet ban ghi do (vd xem chi tiet 1 van ban), tuong tu "mo email = da doc",
 * thay vi bat ho phai tu bam vao dung thong bao trong chuong 🔔. Tra ve so
 * luong vua danh dau (0 neu khong co thong bao nao chua doc lien quan).
 */
export async function markRelatedNotificationsRead(
    userId: string,
    relatedModel: string,
    relatedId: string,
): Promise<number> {
    const deliveries = await NotificationDelivery.find({
        userId,
        readAt: null,
    }).populate({ path: "notificationId", select: "relatedModel relatedId" });

    const idsToMark = deliveries
        .filter(d => {
            const n = d.notificationId as unknown as {
                relatedModel?: string;
                relatedId?: unknown;
            } | null;
            return (
                n?.relatedModel === relatedModel &&
                String(n.relatedId) === relatedId
            );
        })
        .map(d => d._id);

    if (idsToMark.length === 0) return 0;

    const result = await NotificationDelivery.updateMany(
        { _id: { $in: idsToMark } },
        { readAt: new Date() },
    );
    const { count } = await getUnreadCount(userId);
    emitUnreadCount(userId, count);
    return result.modifiedCount;
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
            "Không tìm thấy thông báo hoặc bạn không có quyền truy cập",
            404,
        );
    }
    const { count } = await getUnreadCount(userId);
    emitUnreadCount(userId, count);
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
    emitUnreadCount(userId, 0);
    return { modifiedCount: result.modifiedCount };
}
