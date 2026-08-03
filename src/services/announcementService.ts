import { Announcement, type IAnnouncement, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { areaScopeFilter } from "@/lib/rbac";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateAnnouncementInput,
    UpdateAnnouncementInput,
} from "@/validators/announcement";

export async function createAnnouncement(
    actorUser: IUser,
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
        // Pham vi tac gia: chi gan khi nguoi tao la to truong (xem
        // to-dan-pho-cua-minh), admin/secretary tao thong bao khong bi gioi han.
        neighborhoodId: actorUser.roles.includes("neighborhood_leader")
            ? actorUser.neighborhoodId
            : undefined,
        status: "nhap",
        createdBy: actorUser._id,
    });
    return announcement;
}

/**
 * Nem HttpError(403) neu neighborhood_leader co gan neighborhoodId cua rieng
 * minh (khi tao) khong nam trong to dan pho duoc phan cong hien tai - dung
 * cho sua/xoa/xuat ban. Admin/secretary khong bi gioi han (giu nguyen hanh vi
 * hien tai, chua mo rong scope cho cac vai tro nay trong lan nay).
 */
export function assertAnnouncementInScope(
    user: IUser,
    announcement: IAnnouncement,
): void {
    if (!user.roles.includes("neighborhood_leader")) return;
    const ids = [user.neighborhoodId, ...(user.assignedNeighborhoodIds || [])]
        .filter(Boolean)
        .map(String);
    if (
        !announcement.neighborhoodId ||
        !ids.includes(String(announcement.neighborhoodId))
    ) {
        throw new HttpError(
            "Ban khong co quyen thao tac voi thong bao ngoai to dan pho duoc phan cong",
            403,
        );
    }
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
    actorUser?: IUser;
}) {
    const filter: Record<string, unknown> = {};
    if (params.publicOnly) {
        filter.status = "da_dang";
    } else if (params.status) {
        filter.status = params.status;
    }
    if (params.category) filter.category = params.category;
    // Chi to truong bi gioi han theo to dan pho tren man quan tri
    // (admin=1) - admin/secretary xem duoc tat ca nhu truoc.
    if (
        !params.publicOnly &&
        params.actorUser?.roles.includes("neighborhood_leader")
    ) {
        Object.assign(filter, areaScopeFilter(params.actorUser));
    }

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
