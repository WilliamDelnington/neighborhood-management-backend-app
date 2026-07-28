import { Announcement, type IAnnouncement } from "@/models";
import { HttpError } from "@/lib/response";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateAnnouncementInput,
    UpdateAnnouncementInput,
} from "@/validators/announcement";

export async function createAnnouncement(
    actorId: string,
    input: CreateAnnouncementInput,
) {
    const announcement = await Announcement.create({
        title: input.title,
        content: input.content,
        category: input.category,
        priority: input.priority,
        pinned: input.pinned,
        targetRoles: input.targetRoles || [],
        targetClusters: input.targetClusters || [],
        audienceAll: input.audienceAll,
        status: "nhap",
        createdBy: actorId,
    });
    return announcement;
}

export async function updateAnnouncement(
    actorId: string,
    id: string,
    patch: UpdateAnnouncementInput,
) {
    const announcement = await Announcement.findById(id);
    if (!announcement) throw new HttpError("Khong tim thay thong bao", 404);

    Object.assign(announcement, patch);
    announcement.updatedBy = actorId as any;
    await announcement.save();
    return announcement;
}

export async function publishAnnouncement(
    actorId: string,
    id: string,
): Promise<IAnnouncement> {
    const announcement = await Announcement.findById(id);
    if (!announcement) throw new HttpError("Khong tim thay thong bao", 404);

    announcement.status = "da_dang";
    announcement.publishedAt = new Date();
    announcement.updatedBy = actorId as any;
    await announcement.save();

    await createNotification({
        title: "Thông báo mới",
        body: announcement.title,
        type: "announcement.published",
        targetRoles: announcement.audienceAll
            ? ["house_owner"]
            : announcement.targetRoles,
        targetClusters: announcement.audienceAll
            ? []
            : announcement.targetClusters,
        relatedModel: "Announcement",
        relatedId: announcement._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "announcement.publish",
        targetModel: "Announcement",
        targetId: announcement._id,
    });

    return announcement;
}

export async function listAnnouncements(params: {
    page: number;
    limit: number;
    status?: string;
    category?: string;
    publicOnly?: boolean;
}) {
    const filter: Record<string, unknown> = {};
    if (params.publicOnly) {
        filter.status = "da_dang";
    } else if (params.status) {
        filter.status = params.status;
    }
    if (params.category) filter.category = params.category;

    const [items, total] = await Promise.all([
        Announcement.find(filter)
            .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        Announcement.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getAnnouncementById(id: string, publicOnly: boolean) {
    const announcement = await Announcement.findById(id);
    if (!announcement) throw new HttpError("Khong tim thay thong bao", 404);
    if (publicOnly && announcement.status !== "da_dang") {
        throw new HttpError("Khong tim thay thong bao", 404);
    }
    return announcement;
}

export async function deleteAnnouncement(actorId: string, id: string) {
    const announcement = await Announcement.findById(id);
    if (!announcement) throw new HttpError("Khong tim thay thong bao", 404);
    await announcement.deleteOne();

    await writeAuditLog({
        actorId,
        action: "announcement.delete",
        targetModel: "Announcement",
        targetId: id,
    });
}
