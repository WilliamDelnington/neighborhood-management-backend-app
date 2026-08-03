import { FileAsset, HouseRecord, PcccCheck, type IPcccCheck } from "@/models";
import type { IUser } from "@/models/User";
import { HttpError } from "@/lib/response";
import { areaScopeFilter } from "@/lib/rbac";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { MUC_NGUY_CO_PCCC_LABEL } from "@/types";
import type {
    AssignPcccCheckInput,
    CreatePcccCheckInput,
    UpdatePcccCheckInput,
} from "@/validators/pccc";

const UPDATABLE_BOOLEAN_FIELDS = [
    "hasFireExtinguisher",
    "hasEmergencyExit",
    "hasIndoorEvCharging",
    "hasGasStoveOrStorageOrBusiness",
    "isCrowdedRental",
] as const;

async function notifyHighRisk(
    check: IPcccCheck,
    house: { code: string; address: string },
    actorId: string,
) {
    await createNotification({
        title: "Phát hiện nguy cơ PCCC cao",
        body: `Nhà ${house.code} (${house.address}) đang ở mức nguy cơ PCCC: ${MUC_NGUY_CO_PCCC_LABEL.do}`,
        type: "pccc.high_risk",
        targetRoles: ["admin", "neighborhood_leader"],
        relatedModel: "PcccCheck",
        relatedId: check._id,
        createdBy: actorId,
    });
}

export async function createPcccCheck(
    actorUser: IUser,
    input: CreatePcccCheckInput,
) {
    const house = await HouseRecord.findById(input.houseId).select(
        "_id code address",
    );
    if (!house) throw new HttpError("Khong tim thay nha", 404);

    const inspectorId =
        input.inspectorId && actorUser.roles.includes("admin")
            ? input.inspectorId
            : String(actorUser._id);

    const check = await PcccCheck.create({
        houseId: input.houseId,
        hasFireExtinguisher: input.hasFireExtinguisher,
        hasEmergencyExit: input.hasEmergencyExit,
        hasIndoorEvCharging: input.hasIndoorEvCharging,
        hasGasStoveOrStorageOrBusiness: input.hasGasStoveOrStorageOrBusiness,
        isCrowdedRental: input.isCrowdedRental,
        riskLevel: input.riskLevel,
        remediationNeeded: input.remediationNeeded,
        inspectionDate: new Date(input.inspectionDate),
        inspectorId,
        followUpStatus: input.followUpStatus,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "pccc.create",
        targetModel: "PcccCheck",
        targetId: check._id,
        metadata: {
            houseId: input.houseId,
            riskLevel: check.riskLevel,
        },
    });

    if (check.riskLevel === "do") {
        await notifyHighRisk(check, house, String(actorUser._id));
    }

    return check;
}

export async function listPcccChecks(params: {
    page: number;
    limit: number;
    riskLevel?: string;
    houseId?: string;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = {};
    if (params.riskLevel) filter.riskLevel = params.riskLevel;

    if (params.houseId) {
        filter.houseId = params.houseId;
    } else if (!params.actorUser.roles.includes("admin")) {
        const scopeFilter = areaScopeFilter(params.actorUser);
        if (Object.keys(scopeFilter).length > 0) {
            const houses = await HouseRecord.find(scopeFilter).select("_id");
            filter.houseId = { $in: houses.map(h => h._id) };
        }
    }

    const [items, total] = await Promise.all([
        PcccCheck.find(filter)
            .sort({ inspectionDate: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("houseId", "code address cluster neighborhoodId")
            .populate("inspectorId", "displayName")
            .populate("assigneeId", "displayName"),
        PcccCheck.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getPcccCheckById(id: string) {
    const check = await PcccCheck.findById(id)
        .populate("houseId", "code address cluster neighborhoodId")
        .populate("inspectorId", "displayName")
        .populate("assigneeId", "displayName");
    if (!check)
        throw new HttpError("Khong tim thay bien ban kiem tra PCCC", 404);
    return check;
}

/**
 * Kiem tra quyen truy cap bien ban PCCC theo cum dan cu cua nha lien quan.
 * Nem HttpError(403) neu user khong phai admin va cum cua nha khong nam trong assignedClusters.
 */
export function assertPcccCheckInScope(
    user: IUser,
    check: { houseId: unknown },
): void {
    if (user.roles.includes("admin")) return;
    const house = check.houseId as {
        cluster?: string;
        neighborhoodId?: unknown;
    } | null;

    if (user.roles.includes("neighborhood_leader")) {
        const ids = [user.neighborhoodId, ...(user.assignedNeighborhoodIds || [])]
            .filter(Boolean)
            .map(String);
        const neighborhoodId =
            house && typeof house === "object" ? house.neighborhoodId : undefined;
        if (!neighborhoodId || !ids.includes(String(neighborhoodId))) {
            throw new HttpError(
                "Ban khong co quyen thao tac voi bien ban ngoai to dan pho duoc phan cong",
                403,
            );
        }
        return;
    }

    if (!user.assignedClusters?.length) return;
    const cluster = house && typeof house === "object" ? house.cluster : undefined;
    if (cluster && !user.assignedClusters.includes(cluster)) {
        throw new HttpError(
            "Ban khong co quyen thao tac voi bien ban ngoai cum duoc phan cong",
            403,
        );
    }
}

export async function updatePcccCheck(
    actorUser: IUser,
    id: string,
    patch: UpdatePcccCheckInput,
) {
    const check = await PcccCheck.findById(id);
    if (!check)
        throw new HttpError("Khong tim thay bien ban kiem tra PCCC", 404);

    const previousRiskLevel = check.riskLevel;

    if (patch.houseId !== undefined) {
        const house = await HouseRecord.findById(patch.houseId).select("_id");
        if (!house) throw new HttpError("Khong tim thay nha", 404);
        check.houseId = patch.houseId as unknown as typeof check.houseId;
    }

    for (const field of UPDATABLE_BOOLEAN_FIELDS) {
        if (patch[field] !== undefined) {
            check[field] = patch[field] as boolean;
        }
    }
    if (patch.riskLevel !== undefined) check.riskLevel = patch.riskLevel;
    if (patch.remediationNeeded !== undefined)
        check.remediationNeeded = patch.remediationNeeded;
    if (patch.followUpStatus !== undefined)
        check.followUpStatus = patch.followUpStatus;
    if (patch.inspectionDate !== undefined)
        check.inspectionDate = new Date(patch.inspectionDate);
    if (patch.inspectorId !== undefined && actorUser.roles.includes("admin")) {
        check.inspectorId =
            patch.inspectorId as unknown as typeof check.inspectorId;
    }

    await check.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "pccc.update",
        targetModel: "PcccCheck",
        targetId: check._id,
        metadata: { patch },
    });

    if (check.riskLevel === "do" && previousRiskLevel !== "do") {
        const house = await HouseRecord.findById(check.houseId).select(
            "code address",
        );
        if (house) await notifyHighRisk(check, house, String(actorUser._id));
    }

    return check;
}

export async function assignPcccCheck(
    actorId: string,
    id: string,
    input: AssignPcccCheckInput,
) {
    const check = await PcccCheck.findById(id);
    if (!check)
        throw new HttpError("Khong tim thay bien ban kiem tra PCCC", 404);

    check.assigneeId = input.assigneeId as unknown as typeof check.assigneeId;
    if (input.deadline) check.deadline = new Date(input.deadline);
    // Giao lai/doi han moi thi phai canh bao lai tu dau cho han hien tai.
    check.deadlineWarnedAt = undefined;
    await check.save();

    const house = await HouseRecord.findById(check.houseId).select(
        "code address",
    );

    await createNotification({
        title: "Bạn được giao theo dõi khắc phục PCCC",
        body: house
            ? `Nhà ${house.code} (${house.address}) - hạn khắc phục: ${
                  check.deadline
                      ? check.deadline.toLocaleDateString("vi-VN")
                      : "chưa đặt"
              }`
            : "Bạn được giao theo dõi một bản ghi kiểm tra PCCC",
        type: "pccc.assigned",
        targetUserIds: [input.assigneeId],
        relatedModel: "PcccCheck",
        relatedId: check._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "pccc.assign",
        targetModel: "PcccCheck",
        targetId: check._id,
        metadata: { assigneeId: input.assigneeId, deadline: check.deadline },
    });

    return getPcccCheckById(String(check._id));
}

/**
 * Quet cac bien ban PCCC da qua han khac phuc (deadline <= now) nhung
 * followUpStatus van la "chua_khac_phuc"/"dang_khac_phuc", va chua duoc canh
 * bao cho lan han hien tai (deadlineWarnedAt rong). Goi tu scheduler dinh ky
 * (xem src/lib/scheduler.ts) - khong lien quan request cua nguoi dung.
 */
export async function checkPcccDeadlinesAndNotify(): Promise<number> {
    const overdue = await PcccCheck.find({
        deadline: { $lte: new Date() },
        followUpStatus: { $in: ["chua_khac_phuc", "dang_khac_phuc"] },
        assigneeId: { $exists: true, $ne: null },
        deadlineWarnedAt: { $exists: false },
    }).populate("houseId", "code address");

    for (const check of overdue) {
        const house = check.houseId as unknown as {
            code: string;
            address: string;
        } | null;
        // eslint-disable-next-line no-await-in-loop
        await createNotification({
            title: "Quá hạn khắc phục PCCC",
            body: house
                ? `Nhà ${house.code} (${house.address}) đã quá hạn khắc phục nhưng chưa hoàn thành.`
                : "Một bản ghi kiểm tra PCCC đã quá hạn khắc phục nhưng chưa hoàn thành.",
            type: "pccc.deadline_overdue",
            targetUserIds: [check.assigneeId as unknown as string],
            relatedModel: "PcccCheck",
            relatedId: check._id,
        });
        check.deadlineWarnedAt = new Date();
        // eslint-disable-next-line no-await-in-loop
        await check.save();
    }

    return overdue.length;
}

export async function deletePcccCheck(actorId: string, id: string) {
    const check = await PcccCheck.findByIdAndDelete(id);
    if (!check)
        throw new HttpError("Khong tim thay bien ban kiem tra PCCC", 404);

    const attachments = await FileAsset.find({
        relatedModel: "PcccCheck",
        relatedId: id,
    });
    for (const attachment of attachments) {
        // eslint-disable-next-line no-await-in-loop
        await deleteUploadedFile(attachment.url);
    }
    await FileAsset.deleteMany({ relatedModel: "PcccCheck", relatedId: id });

    await writeAuditLog({
        actorId,
        action: "pccc.delete",
        targetModel: "PcccCheck",
        targetId: id,
    });

    return check;
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

export async function listPcccAttachments(pcccCheckId: string) {
    return FileAsset.find({
        relatedModel: "PcccCheck",
        relatedId: pcccCheckId,
    })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName");
}

export async function uploadPcccAttachment(
    actorId: string,
    pcccCheckId: string,
    file: File,
) {
    const check = await PcccCheck.findById(pcccCheckId).select("_id");
    if (!check)
        throw new HttpError("Khong tim thay bien ban kiem tra PCCC", 404);

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new HttpError("File vuot qua dung luong cho phep (toi da 10MB)", 400);
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
        `pccc/${pcccCheckId}`,
    );

    const fileAsset = await FileAsset.create({
        name: file.name,
        url,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        category: "attachment",
        relatedModel: "PcccCheck",
        relatedId: pcccCheckId,
        isPublic: false,
        audienceAll: false,
        targetRoles: [],
        uploadedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "pccc.attachment.upload",
        targetModel: "PcccCheck",
        targetId: pcccCheckId,
        metadata: { fileAssetId: fileAsset._id, name: file.name },
    });

    return fileAsset;
}

export async function deletePcccAttachment(
    actorId: string,
    pcccCheckId: string,
    fileAssetId: string,
) {
    const fileAsset = await FileAsset.findOne({
        _id: fileAssetId,
        relatedModel: "PcccCheck",
        relatedId: pcccCheckId,
    });
    if (!fileAsset) throw new HttpError("Khong tim thay file dinh kem", 404);

    await deleteUploadedFile(fileAsset.url);
    await fileAsset.deleteOne();

    await writeAuditLog({
        actorId,
        action: "pccc.attachment.delete",
        targetModel: "PcccCheck",
        targetId: pcccCheckId,
        metadata: { fileAssetId, name: fileAsset.name },
    });
}

export async function getHouseRiskSummary() {
    const result = await PcccCheck.aggregate([
        { $sort: { inspectionDate: -1, _id: -1 } },
        {
            $group: {
                _id: "$houseId",
                riskLevel: { $first: "$riskLevel" },
            },
        },
        { $group: { _id: "$riskLevel", count: { $sum: 1 } } },
    ]);

    const summary: Record<string, number> = { xanh: 0, vang: 0, do: 0 };
    for (const row of result as { _id: string; count: number }[]) {
        if (row._id) summary[row._id] = row.count;
    }
    return summary;
}
