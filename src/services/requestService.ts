import { Types } from "mongoose";
import {
    Business,
    Company,
    FileAsset,
    Household,
    HouseOwnership,
    HouseRecord,
    Neighborhood,
    NeighborhoodColeaderAssignment,
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
import {
    REQUEST_TYPE_LABEL,
    REQUEST_TYPES,
    type RequestHouseRole,
    type RequestPriority,
    type RequestType,
} from "@/types";
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

const PRIORITY_WEIGHT: Record<RequestPriority, number> = {
    urgent: 2,
    high: 1,
    normal: 0,
};

type SyncTier = "open" | "active" | "done";

const ACTIVE_TIER_STATUSES = [
    "acknowledged",
    "in_progress",
    "needs_info",
    "awaiting_confirmation",
];

function computeSyncTier(statuses: string[]): SyncTier {
    if (statuses.length === 0) return "open";
    if (statuses.every(s => s === "resolved")) return "done";
    if (statuses.some(s => ACTIVE_TIER_STATUSES.includes(s))) return "active";
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

/**
 * Tra ve userId cua nguoi giu vai tro `houseRole` tai mot Nha so cu the - dung
 * cho To truong/To pho gui nhiem vu ("task") thang xuong dung nguoi tai nha,
 * thay vi chon tung tai khoan rieng le. Chi nguoi ĐÃ co tai khoan lien ket moi
 * nhan duoc (house_owner qua HouseOwnership.ownerId khi ownerType="user";
 * household_head qua Household.headOfHouseholdUserId; business_head/
 * company_rep qua Business/Company.representativeUserId) - nha thuoc to chuc
 * (ownerType="organization") hoac chua lien ket tai khoan dai dien se khong co
 * nguoi nhan tu nhanh nay.
 */
async function resolveHouseRoleRecipientIds(
    houseId: string,
    houseRole: RequestHouseRole,
): Promise<Set<string>> {
    const ids = new Set<string>();
    if (houseRole === "house_owner") {
        const ownerships = await HouseOwnership.find({
            houseId,
            active: true,
            relationshipType: "primary_owner",
            ownerType: "user",
        }).select("ownerId");
        ownerships.forEach(o => ids.add(String(o.ownerId)));
    } else if (houseRole === "household_head") {
        const households = await Household.find({
            houseId,
            headOfHouseholdUserId: { $exists: true, $ne: null },
        }).select("headOfHouseholdUserId");
        households.forEach(h => {
            if (h.headOfHouseholdUserId) ids.add(String(h.headOfHouseholdUserId));
        });
    } else if (houseRole === "business_head") {
        const businesses = await Business.find({
            houseId,
            representativeUserId: { $exists: true, $ne: null },
        }).select("representativeUserId");
        businesses.forEach(b => {
            if (b.representativeUserId) ids.add(String(b.representativeUserId));
        });
    } else if (houseRole === "company_rep") {
        const companies = await Company.find({
            houseId,
            representativeUserId: { $exists: true, $ne: null },
        }).select("representativeUserId");
        companies.forEach(c => {
            if (c.representativeUserId) ids.add(String(c.representativeUserId));
        });
    }
    return ids;
}

/**
 * Tra ve userId cua To truong + cac To pho dang hoat dong cua to dan pho chua
 * mot Nha so cu the - dung cho Phuong giao nhiem vu xac minh xuong To (B13).
 */
async function resolveHouseLeaderRecipientIds(
    houseId: string,
): Promise<Set<string>> {
    const ids = new Set<string>();
    const house = await HouseRecord.findById(houseId).select("neighborhoodId");
    if (!house?.neighborhoodId) return ids;

    const neighborhood = await Neighborhood.findById(
        house.neighborhoodId,
    ).select("leaderUserId");
    if (neighborhood?.leaderUserId) ids.add(String(neighborhood.leaderUserId));

    const coleaderAssignments = await NeighborhoodColeaderAssignment.find({
        neighborhoodId: house.neighborhoodId,
        unassignedAt: { $exists: false },
    }).select("coleaderUserId");
    coleaderAssignments.forEach(a => ids.add(String(a.coleaderUserId)));

    return ids;
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

    if (input.houseId && (input.houseRole || input.targetHouseNeighborhoodLeader)) {
        // Chi To truong/To pho duoc chon nguoi nhan theo vai tro trong Nha -
        // khac voi targetRoles/targetUserIds (mo cho moi loai type/nguoi gui
        // du dieu kien), day la mot nhanh gui rieng, gioi han cung theo vai
        // tro nguoi GUI thay vi permission rieng (xem cau hoi da duoc hoi).
        if (
            !actorUser.roles.includes("neighborhood_leader") &&
            !actorUser.roles.includes("neighborhood_coleader")
        ) {
            throw new HttpError(
                "Chi To truong/To pho moi duoc gui nhiem vu theo Nha so",
                403,
            );
        }
        if (input.houseRole) {
            const houseRoleIds = await resolveHouseRoleRecipientIds(
                input.houseId,
                input.houseRole,
            );
            houseRoleIds.forEach(id => recipientIds.add(id));
        }
        if (input.targetHouseNeighborhoodLeader) {
            const leaderIds = await resolveHouseLeaderRecipientIds(
                input.houseId,
            );
            leaderIds.forEach(id => recipientIds.add(id));
        }
    }

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
        priority: input.priority,
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

    const isAdmin = params.actorUser.roles.includes("admin");
    const canManageAll =
        isAdmin || (await userHasPermission(params.actorUser, "requests.update"));

    if (!canManageAll) {
        // Nguoi khong quan ly toan bo yeu cau (vd secretary chi gui yeu cau)
        // chi duoc thay: yeu cau do minh tao, yeu cau minh la nguoi nhan, hoac
        // (voi vai tro co pham vi khu vuc thuc su duoc gan, vd to truong) yeu
        // cau gan voi nha trong khu vuc phu trach. Neu khong co dieu kien nao
        // trong 3 dieu kien tren duoc gan (vd secretary chua duoc gan cum/to
        // dan pho nao), KHONG con roi ve "xem tat ca" nhu truoc.
        const orClauses: Record<string, unknown>[] = [
            { createdBy: params.actorUser._id },
        ];

        const scopeFilter = areaScopeFilter(params.actorUser);
        if (Object.keys(scopeFilter).length > 0) {
            const houses = await HouseRecord.find(scopeFilter).select("_id");
            orClauses.push({ houseId: { $in: houses.map(h => h._id) } });
        }

        const recipientRows = await RequestRecipient.find({
            userId: params.actorUser._id,
        }).select("requestId");
        if (recipientRows.length > 0) {
            orClauses.push({
                _id: { $in: recipientRows.map(r => r.requestId) },
            });
        }

        filter.$or = orClauses;
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

/**
 * Nem HttpError(403) neu actor khong duoc xem Request nay: admin, hoac co
 * requests.read, hoac la MOT nguoi nhan (RequestRecipient) cua yeu cau. Dung
 * chung boi getRequestById va commentService (B14 - binh luan tren Request
 * chi hien voi nhung ai xem duoc chinh Request do).
 */
export async function assertCanViewRequest(
    actorUser: IUser,
    request: IRequest,
): Promise<void> {
    if (actorUser.roles.includes("admin")) return;
    if (await userHasPermission(actorUser, "requests.read")) return;
    const isRecipient = await RequestRecipient.exists({
        requestId: request._id,
        userId: actorUser._id,
    });
    if (!isRecipient) {
        throw new HttpError("Ban khong co quyen xem yeu cau nay", 403);
    }
}

export async function getRequestById(actorUser: IUser, id: string) {
    const request = await RequestModel.findById(id).populate(
        "createdBy",
        "displayName",
    );
    if (!request) throw new HttpError("Khong tim thay yeu cau", 404);

    await assertCanViewRequest(actorUser, request);

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
    if (input.priority !== undefined) request.priority = input.priority;
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

    // Yeu cau muc do uu tien cao hon luon xep truoc, giu nguyen thu tu (moi
    // nhat truoc) trong cung mot muc do uu tien.
    combined.sort(
        (a, b) =>
            PRIORITY_WEIGHT[b.request.priority] -
            PRIORITY_WEIGHT[a.request.priority],
    );

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
            priority: c.request.priority,
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

export type DashboardRequestItem = {
    _id: string;
    requestId: string;
    type: RequestType;
    title: string;
    priority: RequestPriority;
    status: string;
    dueDate?: Date;
    isOverdue: boolean;
};

/**
 * Danh sach yeu cau chua hoan thanh ma nguoi dung dang dang nhap la nguoi
 * nhan, dung cho widget "Yeu cau can xu ly" tren dashboard - sap xep muc do
 * uu tien cao truoc, sau do den han xu ly gan nhat (khong co han xep sau cung).
 */
export async function listMyPendingRequestsForDashboard(
    userId: string,
    limit = 5,
): Promise<DashboardRequestItem[]> {
    const recipientRows = await RequestRecipient.find({
        userId,
        status: { $ne: "resolved" },
    });
    if (recipientRows.length === 0) return [];

    const requests = await RequestModel.find({
        _id: { $in: recipientRows.map(r => r.requestId) },
    }).select("title type priority dueDate");
    const requestById = new Map(requests.map(r => [String(r._id), r]));

    const combined = recipientRows
        .filter(r => requestById.has(String(r.requestId)))
        .map(r => {
            const request = requestById.get(String(r.requestId))!;
            return {
                _id: String(r._id),
                requestId: String(request._id),
                type: request.type,
                title: request.title,
                priority: request.priority,
                status: r.status,
                dueDate: request.dueDate,
                isOverdue: withOverdue(r, request.dueDate),
            };
        });

    combined.sort((a, b) => {
        const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        if (weightDiff !== 0) return weightDiff;
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        const aDue = a.dueDate ? a.dueDate.getTime() : Infinity;
        const bDue = b.dueDate ? b.dueDate.getTime() : Infinity;
        return aDue - bDue;
    });

    return combined.slice(0, limit);
}

export type MyRequestCounts = {
    inProgress: number;
    dueSoon: number;
    overdue: number;
};

// So ngay truoc han duoc coi la "sap het han". Chua co cau hinh rieng,
// hardcode va co the tach thanh setting sau neu can.
const DUE_SOON_DAYS = 3;

/**
 * Dem so Request ma nguoi dung dang dang nhap la nguoi nhan, chia theo dang
 * xu ly / sap het han / qua han, dung cho widget ca nhan tren dashboard.
 * Mot recipient chi roi vao dung mot nhom: qua han uu tien truoc, sau do
 * sap het han, con lai la dang xu ly (neu status thuoc ACTIVE_TIER_STATUSES).
 */
export async function getMyRequestCounts(
    userId: string,
): Promise<MyRequestCounts> {
    const recipientRows = await RequestRecipient.find({
        userId,
        status: { $in: ACTIVE_TIER_STATUSES },
    }).select("status requestId");
    if (recipientRows.length === 0) {
        return { inProgress: 0, dueSoon: 0, overdue: 0 };
    }

    const requests = await RequestModel.find({
        _id: { $in: recipientRows.map(r => r.requestId) },
    }).select("dueDate");
    const dueDateById = new Map(
        requests.map(r => [String(r._id), r.dueDate]),
    );

    const dueSoonThreshold = Date.now() + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;
    const counts: MyRequestCounts = { inProgress: 0, dueSoon: 0, overdue: 0 };

    for (const recipient of recipientRows) {
        const dueDate = dueDateById.get(String(recipient.requestId));
        if (withOverdue(recipient, dueDate)) {
            counts.overdue += 1;
        } else if (dueDate && dueDate.getTime() <= dueSoonThreshold) {
            counts.dueSoon += 1;
        } else {
            counts.inProgress += 1;
        }
    }

    return counts;
}

export async function updateMyRequestStatus(
    userId: string,
    requestId: string,
    input: UpdateMyRequestStatusInput,
) {
    // "resolved" chi duoc chot boi nguoi quan ly yeu cau (xem
    // confirmRequestRecipient) sau khi nguoi nhan bao "Chờ xác nhận" -
    // nguoi nhan khong duoc tu dat trang thai nay cho chinh minh.
    if (input.status === "resolved") {
        throw new HttpError(
            "Chỉ người giao yêu cầu mới có thể xác nhận hoàn thành",
            403,
        );
    }

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

/**
 * Nguoi quan ly yeu cau (nguoi tao/admin/requests.update) xac nhan hoan thanh
 * hoac yeu cau xu ly lai, sau khi nguoi nhan da bao "Chờ xác nhận"
 * (awaiting_confirmation). Day la noi DUY NHAT mot recipient duoc chuyen
 * thanh "resolved".
 */
export async function confirmRequestRecipient(
    actorUser: IUser,
    requestId: string,
    userId: string,
    decision: "resolved" | "in_progress",
    note?: string,
) {
    const request = await RequestModel.findById(requestId);
    if (!request) throw new HttpError("Khong tim thay yeu cau", 404);
    await assertCanManageRequest(actorUser, request);

    const recipient = await RequestRecipient.findOne({ requestId, userId });
    if (!recipient)
        throw new HttpError("Khong tim thay nguoi nhan cua yeu cau nay", 404);
    if (recipient.status !== "awaiting_confirmation") {
        throw new HttpError(
            "Chỉ có thể xác nhận khi người nhận đang ở trạng thái Chờ xác nhận",
            422,
        );
    }

    recipient.status = decision;
    if (note !== undefined) recipient.note = note;
    if (decision === "resolved") {
        recipient.resolvedAt = new Date();
    } else {
        recipient.resolvedAt = undefined;
    }
    await recipient.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action:
            decision === "resolved"
                ? "request.confirm_completion"
                : "request.reject_completion",
        targetModel: "Request",
        targetId: requestId,
        metadata: { userId, decision },
    });

    await syncDomainRecordStatus(request.relatedModel, request.relatedId);

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
