import {
    Announcement,
    FileAsset,
    HouseRecord,
    Organization,
    type IAnnouncement,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { areaScopeFilter } from "@/lib/rbac";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
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
        targetUserIds: input.targetUserIds || [],
        targetNeighborhoodIds: input.targetNeighborhoodIds || [],
        isUrgent: input.isUrgent,
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

/**
 * Giai quyet danh sach nguoi nhan cu the tu targetUserIds + targetNeighborhoodIds
 * (chu ho cua nhung nha thuoc cac to dan pho duoc chon). targetClusters/
 * targetRoles cu KHONG con dung de gui thong bao toi cu dan - targetClusters
 * so sanh voi User.assignedClusters, la truong danh cho CAN BO (pham vi phu
 * trach), house_owner khong bao gio co gia tri nay nen truoc gio "thong bao
 * theo Tổ" thuc te khong gui toi duoc ai.
 */
async function resolveAnnouncementRecipientIds(
    announcement: IAnnouncement,
): Promise<Set<string>> {
    const recipientIds = new Set<string>(
        announcement.targetUserIds.map(String),
    );

    if (announcement.targetNeighborhoodIds.length > 0) {
        const houses = await HouseRecord.find({
            neighborhoodId: { $in: announcement.targetNeighborhoodIds },
        }).select("ownerType ownerId");

        const orgOwnerIds = houses
            .filter(h => h.ownerType === "organization" && h.ownerId)
            .map(h => String(h.ownerId));
        const representativeByOrgId = new Map<string, string>();
        if (orgOwnerIds.length > 0) {
            const orgs = await Organization.find({
                _id: { $in: orgOwnerIds },
            }).select("representativeUserId");
            for (const org of orgs) {
                if (org.representativeUserId) {
                    representativeByOrgId.set(
                        String(org._id),
                        String(org.representativeUserId),
                    );
                }
            }
        }

        for (const house of houses) {
            if (house.ownerType === "user" && house.ownerId) {
                recipientIds.add(String(house.ownerId));
            } else if (house.ownerType === "organization" && house.ownerId) {
                const representativeId = representativeByOrgId.get(
                    String(house.ownerId),
                );
                if (representativeId) recipientIds.add(representativeId);
            }
        }
    }

    return recipientIds;
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

    const body = announcement.isUrgent
        ? `KHẨN CẤP: ${announcement.title}`
        : announcement.title;

    if (announcement.audienceAll) {
        await createNotification({
            title: "Thông báo mới",
            body,
            type: "announcement.published",
            targetRoles: ["house_owner"],
            relatedModel: "Announcement",
            relatedId: announcement._id,
            createdBy: actorId,
        });
    } else {
        const recipientIds = await resolveAnnouncementRecipientIds(
            announcement,
        );
        if (recipientIds.size > 0) {
            await createNotification({
                title: "Thông báo mới",
                body,
                type: "announcement.published",
                targetUserIds: [...recipientIds],
                relatedModel: "Announcement",
                relatedId: announcement._id,
                createdBy: actorId,
            });
        } else {
            // Chua chon doi tuong nao (targetUserIds/targetNeighborhoodIds
            // deu rong) - giu hanh vi cu de tuong thich voi thong bao nhap
            // truoc khi co tinh nang nay, du targetClusters/targetRoles
            // thuc te co the khong gui toi ai (xem ghi chu tren ham resolve).
            await createNotification({
                title: "Thông báo mới",
                body,
                type: "announcement.published",
                targetRoles: announcement.targetRoles,
                targetClusters: announcement.targetClusters,
                relatedModel: "Announcement",
                relatedId: announcement._id,
                createdBy: actorId,
            });
        }
    }

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

    const attachments = await FileAsset.find({
        relatedModel: "Announcement",
        relatedId: id,
    });
    for (const attachment of attachments) {
        // eslint-disable-next-line no-await-in-loop
        await deleteUploadedFile(attachment.url);
    }
    await FileAsset.deleteMany({ relatedModel: "Announcement", relatedId: id });

    await writeAuditLog({
        actorId,
        action: "announcement.delete",
        targetModel: "Announcement",
        targetId: id,
    });
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf",
    ".doc",
    ".docx",
];

export async function listAnnouncementAttachments(announcementId: string) {
    return FileAsset.find({
        relatedModel: "Announcement",
        relatedId: announcementId,
    })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName");
}

export async function uploadAnnouncementAttachment(
    actorUser: IUser,
    announcementId: string,
    file: File,
) {
    const announcement = await Announcement.findById(announcementId).select(
        "_id",
    );
    if (!announcement) throw new HttpError("Khong tim thay thong bao", 404);

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new HttpError(
            "File vuot qua dung luong cho phep (toi da 10MB)",
            400,
        );
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
        throw new HttpError(
            `Dinh dang file khong duoc ho tro (chi chap nhan ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")})`,
            400,
        );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(
        buffer,
        file.name,
        `announcement/${announcementId}`,
    );

    const fileAsset = await FileAsset.create({
        name: file.name,
        url,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        category: "attachment",
        relatedModel: "Announcement",
        relatedId: announcementId,
        isPublic: false,
        audienceAll: false,
        targetRoles: [],
        uploadedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "announcement.attachment.upload",
        targetModel: "Announcement",
        targetId: announcementId,
        metadata: { fileAssetId: fileAsset._id, name: file.name },
    });

    return fileAsset;
}

export async function deleteAnnouncementAttachment(
    actorUser: IUser,
    announcementId: string,
    fileAssetId: string,
) {
    const fileAsset = await FileAsset.findOne({
        _id: fileAssetId,
        relatedModel: "Announcement",
        relatedId: announcementId,
    });
    if (!fileAsset) throw new HttpError("Khong tim thay file dinh kem", 404);

    await deleteUploadedFile(fileAsset.url);
    await fileAsset.deleteOne();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "announcement.attachment.delete",
        targetModel: "Announcement",
        targetId: announcementId,
        metadata: { fileAssetId, name: fileAsset.name },
    });
}
