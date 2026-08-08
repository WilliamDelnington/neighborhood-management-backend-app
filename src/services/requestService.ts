import { Types } from "mongoose";
import {
    FileAsset,
    HouseRecord,
    PcccCheck,
    Request as RequestModel,
    RequestRecipient,
    SecurityRecord,
    User,
    type IRequest,
} from "@/models";
import type { IUser } from "@/models/User";
import { HttpError } from "@/lib/response";
import {
    areaScopeFilter,
    getRoleKeysWithPermission,
    getUserAllowedRequestTypes,
    userHasPermission,
} from "@/lib/rbac";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { REQUEST_TYPE_LABEL, REQUEST_TYPES, type RequestType } from "@/types";
import type {
    CreateRequestInput,
    UpdateMyRequestStatusInput,
    UpdateRequestInput,
} from "@/validators/request";

function eligiblePermissionForType(type: RequestType): string {
    return `${type}.assign`;
}

function withOverdue(
    recipient: { status: string },
    dueDate?: Date | null,
): boolean {
    return Boolean(
        dueDate &&
            dueDate.getTime() < Date.now() &&
            recipient.status !== "resolved",
    );
}

type SyncTier = "open" | "active" | "done";

function computeSyncTier(statuses: string[]): SyncTier {
    if (statuses.length === 0) return "open";
    if (statuses.every(s => s === "resolved")) return "done";
    if (statuses.some(s => s === "acknowledged" || s === "in_progress"))
        return "active";
    return "open";
}

/**
 * Dong bo MOT CHIEU: trang thai xu ly cua cac Request/RequestRecipient lien
 * quan -> truong theo doi rieng cua ban ghi goc (PcccCheck.followUpStatus /
 * SecurityRecord.monitoringStatus). Goi moi khi mot recipient cap nhat trang
 * thai. Bo qua neu ban ghi goc khong co Request nao lien quan - giu nguyen
 * hanh vi chinh sua thu cong nhu truoc khi co tinh nang nay. Voi
 * SecurityRecord, khong tu dong ha cap mot ho so da "da_bao_cong_an" (trang
 * thai leo thang thu cong, uu tien cao hon) tru khi tat ca yeu cau da hoan
 * thanh.
 */
async function syncDomainRecordStatus(
    relatedModel: string | undefined,
    relatedId: Types.ObjectId | undefined,
): Promise<void> {
    if (!relatedModel || !relatedId) return;
    if (relatedModel !== "PcccCheck" && relatedModel !== "SecurityRecord")
        return;

    const requests = await RequestModel.find({
        relatedModel,
        relatedId,
    }).select("_id");
    if (requests.length === 0) return;

    const recipients = await RequestRecipient.find({
        requestId: { $in: requests.map(r => r._id) },
    }).select("status");
    const tier = computeSyncTier(recipients.map(r => r.status));

    if (relatedModel === "PcccCheck") {
        const newStatus =
            tier === "done"
                ? "da_khac_phuc"
                : tier === "active"
                  ? "dang_khac_phuc"
                  : "chua_khac_phuc";
        const check = await PcccCheck.findById(relatedId).select(
            "followUpStatus",
        );
        if (!check || check.followUpStatus === newStatus) return;
        await PcccCheck.updateOne(
            { _id: relatedId },
            { followUpStatus: newStatus },
        );
        await writeAuditLog({
            action: "pccc.status_sync",
            targetModel: "PcccCheck",
            targetId: relatedId,
            metadata: { followUpStatus: newStatus },
        });
        return;
    }

    const record = await SecurityRecord.findById(relatedId).select(
        "monitoringStatus",
    );
    if (!record) return;
    if (record.monitoringStatus === "da_bao_cong_an" && tier !== "done") {
        return;
    }
    const newStatus =
        tier === "done"
            ? "da_ket_thuc"
            : tier === "active"
              ? "dang_theo_doi"
              : "binh_thuong";
    if (record.monitoringStatus === newStatus) return;
    await SecurityRecord.updateOne(
        { _id: relatedId },
        { monitoringStatus: newStatus },
    );
    await writeAuditLog({
        action: "security.status_sync",
        targetModel: "SecurityRecord",
        targetId: relatedId,
        metadata: { monitoringStatus: newStatus },
    });
}

export async function assertCanManageRequest(
    actorUser: IUser,
    request: IRequest,
): Promise<void> {
    if (actorUser.roles.includes("admin")) return;
    if (String(request.createdBy) === String(actorUser._id)) return;
    if (await userHasPermission(actorUser, "requests.update")) return;
    throw new HttpError("Ban khong co quyen thao tac tren yeu cau nay", 403);
}

async function attachRecipients(request: IRequest) {
    const recipients = await RequestRecipient.find({
        requestId: request._id,
    }).populate("userId", "displayName phone");

    return {
        ...request.toObject(),
        recipients: recipients.map(r => ({
            _id: r._id,
            userId: (r.userId as unknown as { _id: Types.ObjectId })._id,
            displayName:
                (r.userId as unknown as { displayName?: string })
                    ?.displayName || "",
            status: r.status,
            note: r.note,
            respondedAt: r.respondedAt,
            resolvedAt: r.resolvedAt,
            isOverdue: withOverdue(r, request.dueDate),
        })),
    };
}

/**
 * Xac thuc vai tro du dieu kien nhan loai yeu cau, roi hop targetUserIds voi
 * user thuoc targetRoles thanh mot tap id nguoi nhan duy nhat. Dung chung boi
 * createRequest va updateRequest (them nguoi nhan sau khi da tao).
 */
async function resolveRecipientIds(
    type: RequestType,
    targetUserIds: string[],
    targetRoles: string[],
): Promise<Set<string>> {
    const eligibleRoleKeys = await getRoleKeysWithPermission(
        eligiblePermissionForType(type),
    );
    const invalidRoles = targetRoles.filter(
        r => !eligibleRoleKeys.includes(r),
    );
    if (invalidRoles.length > 0) {
        throw new HttpError(
            `Vai tro khong du dieu kien nhan yeu cau loai nay: ${invalidRoles.join(", ")}`,
            422,
        );
    }

    const recipientIds = new Set<string>(targetUserIds);
    if (targetRoles.length > 0) {
        const users = await User.find({ roles: { $in: targetRoles } }).select(
            "_id",
        );
        users.forEach(u => recipientIds.add(String(u._id)));
    }
    return recipientIds;
}

export async function createRequest(
    actorUser: IUser,
    input: CreateRequestInput,
) {
    const allowedTypes = await getUserAllowedRequestTypes(actorUser);
    if (allowedTypes !== null && !allowedTypes.includes(input.type)) {
        throw new HttpError(
            `Ban khong duoc phep gui yeu cau loai "${REQUEST_TYPE_LABEL[input.type]}"`,
            403,
        );
    }

    const recipientIds = await resolveRecipientIds(
        input.type,
        input.targetUserIds,
        input.targetRoles,
    );
    if (recipientIds.size === 0) {
        throw new HttpError("Khong tim thay nguoi nhan phu hop", 422);
    }

    let houseId = input.houseId;
    let houseLabel: { code: string; address: string } | undefined;
    if (houseId) {
        const house = await HouseRecord.findById(houseId).select(
            "code address",
        );
        if (house) houseLabel = house;
    }

    const request = await RequestModel.create({
        type: input.type,
        title: input.title,
        description: input.description,
        relatedModel: input.relatedModel,
        relatedId: input.relatedId,
        houseId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        targetRoles: input.targetRoles,
        createdBy: actorUser._id,
    });

    await RequestRecipient.insertMany(
        [...recipientIds].map(userId => ({
            requestId: request._id,
            userId,
            status: "pending",
        })),
    );

    await createNotification({
        title: input.title,
        body:
            input.description ||
            (houseLabel
                ? `Nhà ${houseLabel.code} (${houseLabel.address})`
                : `Yêu cầu ${REQUEST_TYPE_LABEL[input.type]}`),
        type: `request.${input.type}`,
        targetUserIds: [...recipientIds],
        relatedModel: "Request",
        relatedId: request._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "request.create",
        targetModel: "Request",
        targetId: request._id,
        metadata: { type: input.type, recipientCount: recipientIds.size },
    });

    return attachRecipients(request);
}

export async function listRequests(params: {
    actorUser: IUser;
    page: number;
    limit: number;
    type?: string;
    relatedModel?: string;
    relatedId?: string;
    houseId?: string;
}) {
    const filter: Record<string, unknown> = {};
    if (params.type) filter.type = params.type;
    if (params.relatedModel) filter.relatedModel = params.relatedModel;
    if (params.relatedId) filter.relatedId = params.relatedId;
    if (params.houseId) filter.houseId = params.houseId;

    if (!params.actorUser.roles.includes("admin")) {
        const scopeFilter = areaScopeFilter(params.actorUser);
        if (Object.keys(scopeFilter).length > 0) {
            const houses = await HouseRecord.find(scopeFilter).select("_id");
            filter.houseId = { $in: houses.map(h => h._id) };
        }
    }

    const [items, total] = await Promise.all([
        RequestModel.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("createdBy", "displayName"),
        RequestModel.countDocuments(filter),
    ]);

    const withRecipients = await Promise.all(items.map(attachRecipients));

    return {
        items: withRecipients,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getRequestById(actorUser: IUser, id: string) {
    const request = await RequestModel.findById(id).populate(
        "createdBy",
        "displayName",
    );
    if (!request) throw new HttpError("Khong tim thay yeu cau", 404);

    if (
        !actorUser.roles.includes("admin") &&
        !(await userHasPermission(actorUser, "requests.read"))
    ) {
        const isRecipient = await RequestRecipient.exists({
            requestId: request._id,
            userId: actorUser._id,
        });
        if (!isRecipient) {
            throw new HttpError("Ban khong co quyen xem yeu cau nay", 403);
        }
    }

    return attachRecipients(request);
}

export async function updateRequest(
    actorUser: IUser,
    id: string,
    input: UpdateRequestInput,
) {
    const request = await RequestModel.findById(id);
    if (!request) throw new HttpError("Khong tim thay yeu cau", 404);
    await assertCanManageRequest(actorUser, request);

    if (input.title !== undefined) request.title = input.title;
    if (input.description !== undefined) request.description = input.description;
    if (input.note !== undefined) request.note = input.note;
    if (input.dueDate !== undefined) request.dueDate = new Date(input.dueDate);
    await request.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "request.update",
        targetModel: "Request",
        targetId: request._id,
        metadata: input,
    });

    if (
        (input.addTargetUserIds && input.addTargetUserIds.length > 0) ||
        (input.addTargetRoles && input.addTargetRoles.length > 0)
    ) {
        const candidateIds = await resolveRecipientIds(
            request.type,
            input.addTargetUserIds || [],
            input.addTargetRoles || [],
        );
        const existing = await RequestRecipient.find({
            requestId: request._id,
        }).select("userId");
        const existingIds = new Set(existing.map(r => String(r.userId)));
        const newIds = [...candidateIds].filter(id2 => !existingIds.has(id2));

        if (newIds.length > 0) {
            await RequestRecipient.insertMany(
                newIds.map(userId => ({
                    requestId: request._id,
                    userId,
                    status: "pending",
                })),
            );

            await createNotification({
                title: request.title,
                body: request.description || `Yêu cầu ${REQUEST_TYPE_LABEL[request.type]}`,
                type: `request.${request.type}`,
                targetUserIds: newIds,
                relatedModel: "Request",
                relatedId: request._id,
                createdBy: actorUser._id,
            });

            await writeAuditLog({
                actorId: actorUser._id,
                action: "request.add_recipients",
                targetModel: "Request",
                targetId: request._id,
                metadata: { addedCount: newIds.length },
            });
        }
    }

    return attachRecipients(request);
}

export async function cancelRequest(actorUser: IUser, id: string) {
    const request = await RequestModel.findById(id);
    if (!request) throw new HttpError("Khong tim thay yeu cau", 404);
    await assertCanManageRequest(actorUser, request);

    await RequestRecipient.deleteMany({ requestId: request._id });

    const attachments = await FileAsset.find({
        relatedModel: "Request",
        relatedId: request._id,
    });
    for (const attachment of attachments) {
        // eslint-disable-next-line no-await-in-loop
        await deleteUploadedFile(attachment.url);
    }
    await FileAsset.deleteMany({
        relatedModel: "Request",
        relatedId: request._id,
    });

    await request.deleteOne();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "request.cancel",
        targetModel: "Request",
        targetId: request._id,
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

export async function listRequestAttachments(requestId: string) {
    return FileAsset.find({ relatedModel: "Request", relatedId: requestId })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName");
}

/**
 * Cho phep nguoi quan ly (nguoi tao/admin/requests.update) HOAC bat ky nguoi
 * nhan nao cua yeu cau tai len file (vd. anh chung minh da khac phuc).
 */
async function assertCanAttachToRequest(
    actorUser: IUser,
    request: IRequest,
): Promise<void> {
    if (actorUser.roles.includes("admin")) return;
    if (String(request.createdBy) === String(actorUser._id)) return;
    if (await userHasPermission(actorUser, "requests.update")) return;
    const isRecipient = await RequestRecipient.exists({
        requestId: request._id,
        userId: actorUser._id,
    });
    if (isRecipient) return;
    throw new HttpError("Ban khong co quyen tai file cho yeu cau nay", 403);
}

export async function uploadRequestAttachment(
    actorUser: IUser,
    requestId: string,
    file: File,
) {
    const request = await RequestModel.findById(requestId);
    if (!request) throw new HttpError("Khong tim thay yeu cau", 404);
    await assertCanAttachToRequest(actorUser, request);

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
        `request/${requestId}`,
    );

    const fileAsset = await FileAsset.create({
        name: file.name,
        url,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        category: "attachment",
        relatedModel: "Request",
        relatedId: requestId,
        isPublic: false,
        audienceAll: false,
        targetRoles: [],
        uploadedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "request.attachment.upload",
        targetModel: "Request",
        targetId: requestId,
        metadata: { fileAssetId: fileAsset._id, name: file.name },
    });

    return fileAsset;
}

export async function deleteRequestAttachment(
    actorUser: IUser,
    requestId: string,
    fileAssetId: string,
) {
    const request = await RequestModel.findById(requestId);
    if (!request) throw new HttpError("Khong tim thay yeu cau", 404);
    await assertCanManageRequest(actorUser, request);

    const fileAsset = await FileAsset.findOne({
        _id: fileAssetId,
        relatedModel: "Request",
        relatedId: requestId,
    });
    if (!fileAsset) throw new HttpError("Khong tim thay file dinh kem", 404);

    await deleteUploadedFile(fileAsset.url);
    await fileAsset.deleteOne();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "request.attachment.delete",
        targetModel: "Request",
        targetId: requestId,
        metadata: { fileAssetId, name: fileAsset.name },
    });
}

export async function listMyRequests(
    userId: string,
    params: {
        page: number;
        limit: number;
        status?: string;
        type?: string;
        overdueOnly?: boolean;
    },
) {
    const recipientFilter: Record<string, unknown> = { userId };
    if (params.status) recipientFilter.status = params.status;

    const recipientRows = await RequestRecipient.find(recipientFilter).sort({
        createdAt: -1,
    });
    const requestIds = recipientRows.map(r => r.requestId);

    const requestFilter: Record<string, unknown> = { _id: { $in: requestIds } };
    if (params.type) requestFilter.type = params.type;

    const allMatching = await RequestModel.find(requestFilter).populate(
        "createdBy",
        "displayName",
    );
    const requestById = new Map(allMatching.map(r => [String(r._id), r]));

    let combined = recipientRows
        .filter(r => requestById.has(String(r.requestId)))
        .map(r => {
            const request = requestById.get(String(r.requestId))!;
            const isOverdue = withOverdue(r, request.dueDate);
            return { recipient: r, request, isOverdue };
        });

    if (params.overdueOnly) {
        combined = combined.filter(c => c.isOverdue);
    }

    const total = combined.length;
    const page = params.page;
    const limit = params.limit;
    const paged = combined.slice((page - 1) * limit, page * limit);

    return {
        items: paged.map(c => ({
            _id: c.recipient._id,
            requestId: c.request._id,
            type: c.request.type,
            title: c.request.title,
            description: c.request.description,
            houseId: c.request.houseId,
            dueDate: c.request.dueDate,
            createdBy: c.request.createdBy,
            createdAt: c.request.createdAt,
            status: c.recipient.status,
            note: c.recipient.note,
            respondedAt: c.recipient.respondedAt,
            resolvedAt: c.recipient.resolvedAt,
            isOverdue: c.isOverdue,
        })),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function updateMyRequestStatus(
    userId: string,
    requestId: string,
    input: UpdateMyRequestStatusInput,
) {
    const recipient = await RequestRecipient.findOne({ requestId, userId });
    if (!recipient)
        throw new HttpError(
            "Ban khong phai la nguoi nhan cua yeu cau nay",
            404,
        );

    recipient.status = input.status;
    if (input.note !== undefined) recipient.note = input.note;
    if (!recipient.respondedAt && input.status !== "pending") {
        recipient.respondedAt = new Date();
    }
    if (input.status === "resolved") recipient.resolvedAt = new Date();
    await recipient.save();

    await writeAuditLog({
        actorId: userId,
        action: "request.update_status",
        targetModel: "Request",
        targetId: requestId,
        metadata: { status: input.status },
    });

    const request = await RequestModel.findById(requestId).select(
        "relatedModel relatedId",
    );
    await syncDomainRecordStatus(request?.relatedModel, request?.relatedId);

    return recipient;
}

export async function getRequestMeta(actorUser: IUser) {
    const allowedTypes = await getUserAllowedRequestTypes(actorUser);
    const types = (
        allowedTypes === null ? [...REQUEST_TYPES] : allowedTypes
    ) as RequestType[];

    const eligibleRolesByType: Record<string, string[]> = {};
    for (const type of types) {
        eligibleRolesByType[type] = await getRoleKeysWithPermission(
            eligiblePermissionForType(type),
        );
    }

    return { allowedTypes: types, eligibleRolesByType };
}
