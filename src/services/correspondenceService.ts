import {
    Correspondence,
    CorrespondenceReply,
    CorrespondenceType,
    FileAsset,
    User,
    type ICorrespondence,
    type ICorrespondenceType,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { getCorrespondenceTypeById } from "@/services/correspondenceTypeService";
import type {
    CreateCorrespondenceInput,
    CreateCorrespondenceReplyInput,
    UpdateCorrespondenceInput,
} from "@/validators/correspondence";

async function loadCorrespondenceType(
    id: unknown,
): Promise<ICorrespondenceType> {
    return getCorrespondenceTypeById(String(id));
}

export async function createCorrespondence(
    actorUser: IUser,
    input: CreateCorrespondenceInput,
) {
    const type = await loadCorrespondenceType(input.correspondenceTypeId);
    if (!type.active) {
        throw new HttpError("Loai van ban nay hien khong con su dung", 400);
    }
    if (!actorUser.roles.some(r => type.allowedSenderRoles.includes(r))) {
        throw new HttpError(
            "Vai tro cua ban khong duoc phep gui loai van ban nay",
            403,
        );
    }
    if (type.requireDocumentNumber && !input.documentNumber?.trim()) {
        throw new HttpError("Loai van ban nay bat buoc nhap so/ky hieu", 400);
    }

    return Correspondence.create({
        correspondenceTypeId: type._id,
        documentNumber: input.documentNumber,
        title: input.title,
        content: input.content,
        issuedAt: input.issuedAt,
        isUrgent: input.isUrgent,
        targetNeighborhoodIds: input.targetNeighborhoodIds || [],
        targetUserIds: input.targetUserIds || [],
        status: "nhap",
        senderId: actorUser._id,
        createdBy: actorUser._id,
    });
}

/**
 * True neu user la nguoi nhan cua van ban: duoc chi dinh truc tiep
 * (targetUserIds), hoac vai tro cua user nam trong allowedReceiverRoles cua
 * loai van ban VA user phu trach mot trong cac to dan pho duoc chon
 * (targetNeighborhoodIds) - cung quy uoc voi resolveCorrespondenceRecipientIds.
 */
function isCorrespondenceRecipient(
    user: IUser,
    correspondence: ICorrespondence,
    type: ICorrespondenceType,
): boolean {
    if (
        correspondence.targetUserIds.some(id => String(id) === String(user._id))
    ) {
        return true;
    }
    if (!user.roles.some(r => type.allowedReceiverRoles.includes(r))) {
        return false;
    }
    if (correspondence.targetNeighborhoodIds.length === 0) return false;
    const userNeighborhoodIds = [
        user.neighborhoodId,
        ...(user.assignedNeighborhoodIds || []),
    ]
        .filter(Boolean)
        .map(String);
    return correspondence.targetNeighborhoodIds.some(id =>
        userNeighborhoodIds.includes(String(id)),
    );
}

/**
 * Nem HttpError(403) neu user khong co quyen xem/thao tac van ban nay: admin
 * va nguoi gui (senderId) luon duoc phep; nguoi nhan chi duoc phep khi van ban
 * da duoc gui (nhap = ban thao rieng cua nguoi gui, chua ai duoc xem).
 */
export function assertCorrespondenceInScope(
    user: IUser,
    correspondence: ICorrespondence,
    type: ICorrespondenceType,
): void {
    if (user.roles.includes("admin")) return;
    if (String(correspondence.senderId) === String(user._id)) return;
    if (
        correspondence.status === "da_gui" &&
        isCorrespondenceRecipient(user, correspondence, type)
    ) {
        return;
    }
    throw new HttpError("Ban khong co quyen thao tac voi van ban nay", 403);
}

export async function updateCorrespondence(
    actorUser: IUser,
    id: string,
    patch: UpdateCorrespondenceInput,
) {
    const correspondence = await Correspondence.findById(id);
    if (!correspondence) throw new HttpError("Khong tim thay van ban", 404);
    const type = await loadCorrespondenceType(
        correspondence.correspondenceTypeId,
    );
    assertCorrespondenceInScope(actorUser, correspondence, type);
    if (correspondence.status !== "nhap") {
        throw new HttpError("Van ban da gui, khong the sua", 400);
    }
    if (
        type.requireDocumentNumber &&
        patch.documentNumber !== undefined &&
        !patch.documentNumber.trim()
    ) {
        throw new HttpError("Loai van ban nay bat buoc nhap so/ky hieu", 400);
    }

    Object.assign(correspondence, patch);
    correspondence.updatedBy = actorUser._id as any;
    await correspondence.save();
    return correspondence;
}

/**
 * Giai quyet danh sach nguoi nhan cu the: targetUserIds + (neu loai van ban
 * cho phep nhan theo to dan pho) to truong phu trach bat ky to dan pho nao
 * trong targetNeighborhoodIds - cung quy uoc voi isCorrespondenceRecipient.
 */
async function resolveCorrespondenceRecipientIds(
    correspondence: ICorrespondence,
    type: ICorrespondenceType,
): Promise<Set<string>> {
    const recipientIds = new Set<string>(
        correspondence.targetUserIds.map(String),
    );

    if (
        correspondence.targetNeighborhoodIds.length > 0 &&
        type.allowedReceiverRoles.includes("neighborhood_leader")
    ) {
        const leaders = await User.find({
            roles: "neighborhood_leader",
            $or: [
                {
                    neighborhoodId: {
                        $in: correspondence.targetNeighborhoodIds,
                    },
                },
                {
                    assignedNeighborhoodIds: {
                        $in: correspondence.targetNeighborhoodIds,
                    },
                },
            ],
        }).select("_id");
        for (const leader of leaders) recipientIds.add(String(leader._id));
    }

    return recipientIds;
}

export async function sendCorrespondence(
    actorUser: IUser,
    id: string,
): Promise<ICorrespondence> {
    const correspondence = await Correspondence.findById(id);
    if (!correspondence) throw new HttpError("Khong tim thay van ban", 404);
    const type = await loadCorrespondenceType(
        correspondence.correspondenceTypeId,
    );
    assertCorrespondenceInScope(actorUser, correspondence, type);
    if (correspondence.status === "da_gui") {
        throw new HttpError("Van ban nay da duoc gui truoc do", 400);
    }

    if (
        correspondence.targetNeighborhoodIds.length > 0 &&
        !type.allowedReceiverRoles.includes("neighborhood_leader")
    ) {
        throw new HttpError(
            "Loai van ban nay khong the gui theo to dan pho",
            400,
        );
    }
    if (correspondence.targetUserIds.length > 0) {
        const targetUsers = await User.find({
            _id: { $in: correspondence.targetUserIds },
        }).select("roles");
        const allValid =
            targetUsers.length === correspondence.targetUserIds.length &&
            targetUsers.every(u =>
                u.roles.some(r => type.allowedReceiverRoles.includes(r)),
            );
        if (!allValid) {
            throw new HttpError(
                "Mot so nguoi nhan khong hop le voi loai van ban nay",
                400,
            );
        }
    }

    const recipientIds = await resolveCorrespondenceRecipientIds(
        correspondence,
        type,
    );
    if (recipientIds.size === 0) {
        throw new HttpError("Chua chon nguoi nhan cho van ban nay", 400);
    }

    correspondence.status = "da_gui";
    correspondence.sentAt = new Date();
    correspondence.updatedBy = actorUser._id as any;
    await correspondence.save();

    const label = correspondence.documentNumber
        ? `${correspondence.documentNumber} - ${correspondence.title}`
        : correspondence.title;
    const body = correspondence.isUrgent ? `KHẨN: ${label}` : label;
    await createNotification({
        title: `${type.name} mới`,
        body,
        type: "correspondence.sent",
        targetUserIds: [...recipientIds],
        relatedModel: "Correspondence",
        relatedId: correspondence._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "correspondence.send",
        targetModel: "Correspondence",
        targetId: correspondence._id,
        metadata: { recipientCount: recipientIds.size },
    });

    return correspondence;
}

export async function listCorrespondences(params: {
    page: number;
    limit: number;
    view?: "sent" | "received";
    status?: string;
    actorUser: IUser;
}) {
    const { actorUser } = params;
    const filter: Record<string, unknown> = {};

    if (actorUser.roles.includes("admin")) {
        if (params.status) filter.status = params.status;
        if (params.view === "sent") filter.senderId = actorUser._id;
    } else {
        const view = params.view || "received";
        if (view === "sent") {
            filter.senderId = actorUser._id;
            if (params.status) filter.status = params.status;
        } else {
            const userNeighborhoodIds = [
                actorUser.neighborhoodId,
                ...(actorUser.assignedNeighborhoodIds || []),
            ].filter(Boolean);
            filter.status = "da_gui";
            filter.$or = [
                { targetUserIds: actorUser._id },
                { targetNeighborhoodIds: { $in: userNeighborhoodIds } },
            ];
        }
    }

    const [items, total] = await Promise.all([
        Correspondence.find(filter)
            .sort({ isUrgent: -1, issuedAt: -1, createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("correspondenceTypeId", "name code"),
        Correspondence.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getCorrespondenceById(id: string) {
    const correspondence = await Correspondence.findById(id).populate(
        "correspondenceTypeId",
        "name code requireDocumentNumber allowedSenderRoles allowedReceiverRoles",
    );
    if (!correspondence) throw new HttpError("Khong tim thay van ban", 404);
    return correspondence;
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

async function loadCorrespondenceAndType(id: string) {
    const correspondence = await Correspondence.findById(id).select(
        "_id senderId status targetUserIds targetNeighborhoodIds correspondenceTypeId",
    );
    if (!correspondence) throw new HttpError("Khong tim thay van ban", 404);
    const type = await loadCorrespondenceType(
        correspondence.correspondenceTypeId,
    );
    return { correspondence, type };
}

export async function listCorrespondenceAttachments(
    actorUser: IUser,
    correspondenceId: string,
) {
    const { correspondence, type } = await loadCorrespondenceAndType(
        correspondenceId,
    );
    assertCorrespondenceInScope(actorUser, correspondence, type);

    return FileAsset.find({
        relatedModel: "Correspondence",
        relatedId: correspondenceId,
    })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName");
}

export async function uploadCorrespondenceAttachment(
    actorUser: IUser,
    correspondenceId: string,
    file: File,
) {
    const { correspondence, type } = await loadCorrespondenceAndType(
        correspondenceId,
    );
    assertCorrespondenceInScope(actorUser, correspondence, type);

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
        `correspondence/${correspondenceId}`,
    );

    const fileAsset = await FileAsset.create({
        name: file.name,
        url,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        category: "attachment",
        relatedModel: "Correspondence",
        relatedId: correspondenceId,
        isPublic: false,
        audienceAll: false,
        targetRoles: [],
        uploadedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "correspondence.attachment.upload",
        targetModel: "Correspondence",
        targetId: correspondenceId,
        metadata: { fileAssetId: fileAsset._id, name: file.name },
    });

    return fileAsset;
}

export async function deleteCorrespondenceAttachment(
    actorUser: IUser,
    correspondenceId: string,
    fileAssetId: string,
) {
    const { correspondence, type } = await loadCorrespondenceAndType(
        correspondenceId,
    );
    assertCorrespondenceInScope(actorUser, correspondence, type);

    const fileAsset = await FileAsset.findOne({
        _id: fileAssetId,
        relatedModel: "Correspondence",
        relatedId: correspondenceId,
    });
    if (!fileAsset) throw new HttpError("Khong tim thay file dinh kem", 404);

    await deleteUploadedFile(fileAsset.url);
    await fileAsset.deleteOne();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "correspondence.attachment.delete",
        targetModel: "Correspondence",
        targetId: correspondenceId,
        metadata: { fileAssetId, name: fileAsset.name },
    });
}

export async function listCorrespondenceReplies(
    actorUser: IUser,
    correspondenceId: string,
) {
    const { correspondence, type } = await loadCorrespondenceAndType(
        correspondenceId,
    );
    assertCorrespondenceInScope(actorUser, correspondence, type);

    return CorrespondenceReply.find({ correspondenceId })
        .sort({ createdAt: 1 })
        .populate("actorId", "displayName roles");
}

export async function createCorrespondenceReply(
    actorUser: IUser,
    correspondenceId: string,
    input: CreateCorrespondenceReplyInput,
) {
    const correspondence = await Correspondence.findById(correspondenceId);
    if (!correspondence) throw new HttpError("Khong tim thay van ban", 404);
    const type = await loadCorrespondenceType(
        correspondence.correspondenceTypeId,
    );
    assertCorrespondenceInScope(actorUser, correspondence, type);

    const reply = await CorrespondenceReply.create({
        correspondenceId: correspondence._id,
        content: input.content,
        actorId: actorUser._id,
    });

    const isSenderReplying =
        String(correspondence.senderId) === String(actorUser._id);
    const notifyRecipientIds = isSenderReplying
        ? [...(await resolveCorrespondenceRecipientIds(correspondence, type))]
        : [String(correspondence.senderId)];

    await createNotification({
        title: `Phản hồi ${type.name.toLowerCase()}`,
        body: correspondence.documentNumber
            ? `${correspondence.documentNumber} - ${correspondence.title}`
            : correspondence.title,
        type: "correspondence.replied",
        targetUserIds: notifyRecipientIds,
        relatedModel: "Correspondence",
        relatedId: correspondence._id,
        createdBy: actorUser._id,
    });

    return reply;
}
