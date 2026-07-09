import { Notification, User } from "@/models";
import { inAppAdapter } from "@/lib/notificationAdapters";
import type { NotificationChannel, Role } from "@/types";
import type { Types } from "mongoose";

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
    }

    return notification;
}
