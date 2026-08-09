import { Notification, NotificationDelivery, User } from "@/models";
import { inAppAdapter } from "@/lib/notificationAdapters";
import { emitUnreadCount } from "@/lib/socket";
import type { NotificationChannel, Role } from "@/types";
import { Types } from "mongoose";

export type CreateNotificationParams = {
    title: string;
    body: string;
    type: string;
    targetRoles?: Role[];
    targetClusters?: string[];
    targetUserIds?: (string | Types.ObjectId)[];
    relatedModel?: string;
    relatedId?: string | Types.ObjectId;
    channel?: NotificationChannel;
    createdBy?: string | Types.ObjectId;
};

/**
 * Tao thong bao va phat sinh NotificationDelivery cho tat ca user phu hop
 * (theo targetUserIds, hoac theo targetRoles/targetClusters neu khong chi dinh user cu the).
 * Duoc goi khi: thong bao duoc publish, phan anh doi trang thai, cuoc hop duoc tao/cap nhat,
 * khao sat mo, hoac admin giao viec.
 */
export async function createNotification(params: CreateNotificationParams) {
    const {
        title,
        body,
        type,
        targetRoles = [],
        targetClusters = [],
        targetUserIds = [],
        relatedModel,
        relatedId,
        channel = "in_app",
        createdBy,
    } = params;

    const notification = await Notification.create({
        title,
        body,
        type,
        targetRoles,
        targetClusters,
        targetUserIds,
        relatedModel,
        relatedId,
        channel,
        status: "queued",
        createdBy,
    });

    let recipientIds: string[] = targetUserIds.map(String);

    if (
        recipientIds.length === 0 &&
        (targetRoles.length > 0 || targetClusters.length > 0)
    ) {
        const filter: Record<string, unknown> = {};
        if (targetRoles.length > 0) filter.roles = { $in: targetRoles };
        if (targetClusters.length > 0)
            filter.assignedClusters = { $in: targetClusters };
        const users = await User.find(filter).select("_id");
        recipientIds = users.map(u => String(u._id));
    }

    if (recipientIds.length > 0) {
        await inAppAdapter.deliver(
            recipientIds.map(userId => ({
                notificationId: notification._id,
                userId,
            })),
        );
        notification.status = "sent";
        await notification.save();

        await notifyUnreadCounts(recipientIds);
    }

    return notification;
}

/**
 * Tinh lai so thong bao chua doc cho tung recipient (mot query aggregate cho
 * ca lo, thay vi N query rieng le) va phat realtime qua socket - de badge tren
 * chuong thong bao cap nhat ngay ma khong can doi vong poll tiep theo.
 */
async function notifyUnreadCounts(recipientIds: string[]): Promise<void> {
    const objectIds = recipientIds.map(id => new Types.ObjectId(id));
    const counts = await NotificationDelivery.aggregate([
        { $match: { userId: { $in: objectIds }, readAt: null } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]);
    const countByUserId = new Map(counts.map(c => [String(c._id), c.count]));
    for (const userId of recipientIds) {
        emitUnreadCount(userId, countByUserId.get(userId) || 0);
    }
}
