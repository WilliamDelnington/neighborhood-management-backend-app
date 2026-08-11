import { Types } from "mongoose";
import {
    Complaint,
    FileAsset,
    HouseRecord,
    InspectionCampaign,
    InspectionResult,
    InspectionTarget,
    Neighborhood,
    PeriodicReport,
    PeriodicReportVersion,
    Request as RequestModel,
    RequestRecipient,
    SecurityRecord,
    User,
    type IPeriodicReport,
    type IPeriodicReportAutoSummary,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import {
    getRoleKeysWithPermission,
    userHasPermission,
} from "@/lib/rbac";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/localUpload";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreatePeriodicReportInput,
    UpdatePeriodicReportInput,
} from "@/validators/periodicReport";

const EDITABLE_STATUSES = [
    "draft",
    "revision_required",
    "revision_requested",
    "recalled",
];
const SUBMITTED_STATUSES = ["submitted", "resubmitted"];
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
];

function dateRange(from: Date, to: Date) {
    return { $gte: from, $lte: to };
}

function assignedNeighborhoodIds(actorUser: IUser): string[] {
    return [
        actorUser.neighborhoodId,
        ...(actorUser.assignedNeighborhoodIds || []),
    ]
        .filter(Boolean)
        .map(String);
}

async function assertNeighborhoodInAuthorScope(
    actorUser: IUser,
    neighborhoodId: string,
) {
    if (!Types.ObjectId.isValid(neighborhoodId)) {
        throw new HttpError("To dan pho khong hop le", 422);
    }
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Khong tim thay To dan pho", 404);
    if (actorUser.roles.includes("admin")) return neighborhood;
    if (actorUser.wardCode) {
        if (neighborhood.wardCode !== actorUser.wardCode) {
            throw new HttpError("To dan pho khong thuoc Phuong dang phu trach", 403);
        }
        return neighborhood;
    }
    if (!assignedNeighborhoodIds(actorUser).includes(String(neighborhood._id))) {
        throw new HttpError("To dan pho nam ngoai pham vi duoc giao", 403);
    }
    return neighborhood;
}

async function resolveReportNeighborhood(
    actorUser: IUser,
    requestedId?: string,
) {
    if (requestedId) return assertNeighborhoodInAuthorScope(actorUser, requestedId);
    const assignedIds = assignedNeighborhoodIds(actorUser);
    if (assignedIds.length === 1) {
        return assertNeighborhoodInAuthorScope(actorUser, assignedIds[0]);
    }
    if (actorUser.wardCode) {
        const neighborhoods = await Neighborhood.find({
            wardCode: actorUser.wardCode,
            status: { $ne: "CLOSED" },
        }).limit(2);
        if (neighborhoods.length === 1) return neighborhoods[0];
    }
    throw new HttpError("Vui long chon To dan pho lap bao cao", 422);
}

async function assertValidWardRecipient(
    submittedToUserId: string | undefined,
    neighborhood: { wardCode?: number },
) {
    if (!submittedToUserId || !Types.ObjectId.isValid(submittedToUserId)) {
        throw new HttpError("Vui long chon noi nhan bao cao cap Phuong", 422);
    }
    const recipient = await User.findOne({
        _id: submittedToUserId,
        status: "active",
    });
    if (!recipient) throw new HttpError("Noi nhan bao cao khong hop le", 422);
    const receiverRoleKeys = await getRoleKeysWithPermission("reports.receive");
    if (
        !recipient.roles.includes("admin") &&
        !recipient.roles.some(role => receiverRoleKeys.includes(role))
    ) {
        throw new HttpError("Nguoi duoc chon khong co quyen nhan bao cao", 422);
    }
    if (
        !recipient.roles.includes("admin") &&
        neighborhood.wardCode &&
        recipient.wardCode !== neighborhood.wardCode
    ) {
        throw new HttpError("Noi nhan khong thuoc cung Phuong voi To dan pho", 422);
    }
    return recipient;
}

async function scopedUserIds(neighborhoodId: Types.ObjectId) {
    return User.distinct("_id", {
        $or: [
            { neighborhoodId },
            { assignedNeighborhoodIds: neighborhoodId },
        ],
    });
}

export async function buildPeriodicReportAutoSummary(
    neighborhoodId: Types.ObjectId,
    periodStart: Date,
    periodEnd: Date,
): Promise<IPeriodicReportAutoSummary> {
    const [userIds, houseIds, campaigns, feedbackRows] = await Promise.all([
        scopedUserIds(neighborhoodId),
        HouseRecord.distinct("_id", { neighborhoodId }),
        InspectionCampaign.find({
            startAt: { $lte: periodEnd },
            dueAt: { $gte: periodStart },
        }).select("_id"),
        Complaint.find({
            neighborhoodId,
            createdAt: dateRange(periodStart, periodEnd),
        }).select("status escalatedToCommittee"),
    ]);

    const assignmentFilter: Record<string, unknown> = {
        userId: { $in: userIds },
        createdAt: dateRange(periodStart, periodEnd),
    };
    const requestAssignments = await RequestRecipient.find(assignmentFilter).select(
        "requestId status resolvedAt createdAt",
    );
    const requests = await RequestModel.find({
        _id: { $in: requestAssignments.map(row => row.requestId) },
    }).select("dueDate");
    const requestById = new Map(requests.map(row => [String(row._id), row]));
    const completedTasks = requestAssignments.filter(
        row => row.resolvedAt && row.resolvedAt <= periodEnd,
    ).length;
    const overdueTasks = requestAssignments.filter(row => {
        const dueDate = requestById.get(String(row.requestId))?.dueDate;
        return Boolean(
            dueDate &&
                dueDate < periodEnd &&
                (!row.resolvedAt || row.resolvedAt > dueDate),
        );
    }).length;

    const targets = campaigns.length
        ? await InspectionTarget.find({
              neighborhoodId,
              campaignId: { $in: campaigns.map(campaign => campaign._id) },
          }).select("_id resultStatus selfDeclarationStatus")
        : [];
    const results = targets.length
        ? await InspectionResult.find({
              targetId: { $in: targets.map(target => target._id) },
          }).select("targetId outcome status")
        : [];
    const resultByTarget = new Map(results.map(row => [String(row.targetId), row]));

    const securityCases = houseIds.length
        ? await SecurityRecord.find({
              houseId: { $in: houseIds },
              hasSecurityComplaint: true,
              inspectionDate: dateRange(periodStart, periodEnd),
          }).select("monitoringStatus")
        : [];

    return {
        tasks: {
            received: requestAssignments.length,
            completed: completedTasks,
            overdue: overdueTasks,
        },
        feedback: {
            received: feedbackRows.length,
            verified: feedbackRows.filter(row =>
                ["da_xu_ly", "hoan_thanh", "dong"].includes(row.status),
            ).length,
            forwarded: feedbackRows.filter(row => row.escalatedToCommittee).length,
            pending: feedbackRows.filter(row =>
                ["moi_tiep_nhan", "dang_xu_ly", "can_bo_sung"].includes(row.status),
            ).length,
        },
        inspections: {
            total: targets.length,
            completed: targets.filter(target => target.resultStatus === "VERIFIED").length,
            passed: targets.filter(
                target => resultByTarget.get(String(target._id))?.outcome === "PASS",
            ).length,
            failed: targets.filter(
                target => resultByTarget.get(String(target._id))?.outcome === "FAIL",
            ).length,
            pending: targets.filter(target =>
                ["PENDING", "DRAFT", "SUBMITTED"].includes(target.resultStatus),
            ).length,
            revisionRequired: targets.filter(
                target => target.resultStatus === "REQUEST_REVISION",
            ).length,
            fieldCheckRequired: targets.filter(
                target => target.resultStatus === "FIELD_CHECK_REQUIRED",
            ).length,
        },
        cases: {
            total: securityCases.length,
            open: securityCases.filter(row => row.monitoringStatus !== "da_ket_thuc")
                .length,
            resolved: securityCases.filter(row => row.monitoringStatus === "da_ket_thuc")
                .length,
        },
        generatedAt: new Date(),
    };
}

async function reportContextOptions(actorUser: IUser) {
    if (actorUser.roles.includes("admin")) {
        return Neighborhood.find({ status: { $ne: "CLOSED" } })
            .select("code name wardCode wardName")
            .sort({ wardCode: 1, code: 1 });
    }
    if (actorUser.wardCode) {
        return Neighborhood.find({
            wardCode: actorUser.wardCode,
            status: { $ne: "CLOSED" },
        })
            .select("code name wardCode wardName")
            .sort({ code: 1 });
    }
    return Neighborhood.find({
        _id: { $in: assignedNeighborhoodIds(actorUser) },
        status: { $ne: "CLOSED" },
    })
        .select("code name wardCode wardName")
        .sort({ code: 1 });
}

export async function getPeriodicReportContext(
    actorUser: IUser,
    neighborhoodId?: string,
) {
    const neighborhoods = await reportContextOptions(actorUser);
    let recipients: IUser[] = [];
    if (neighborhoodId) {
        const neighborhood = await assertNeighborhoodInAuthorScope(
            actorUser,
            neighborhoodId,
        );
        const roleKeys = await getRoleKeysWithPermission("reports.receive");
        recipients = await User.find({
            status: "active",
            roles: { $in: [...roleKeys, "admin"] },
            ...(neighborhood.wardCode
                ? {
                      $or: [
                          { wardCode: neighborhood.wardCode },
                          { roles: "admin" },
                      ],
                  }
                : {}),
        }).select("displayName roles wardCode wardName");
    }
    return {
        neighborhoods,
        recipients: recipients.map(user => ({
            id: String(user._id),
            displayName: user.displayName,
            roles: user.roles,
            wardCode: user.wardCode,
            wardName: user.wardName,
        })),
    };
}

function assertIsAuthor(report: IPeriodicReport, actorUser: IUser): void {
    if (actorUser.roles.includes("admin")) return;
    if (String(report.authorUserId) !== String(actorUser._id)) {
        throw new HttpError("Chi tac gia bao cao nay moi duoc thao tac", 403);
    }
}

async function assertIsReceiver(report: IPeriodicReport, actorUser: IUser) {
    if (actorUser.roles.includes("admin")) return;
    if (String(report.submittedToUserId) !== String(actorUser._id)) {
        throw new HttpError("Chi noi nhan bao cao moi duoc thao tac", 403);
    }
}

async function getReportInScope(actorUser: IUser, id: string) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    if (
        actorUser.roles.includes("admin") ||
        String(report.authorUserId) === String(actorUser._id) ||
        String(report.submittedToUserId) === String(actorUser._id)
    ) {
        return report;
    }
    throw new HttpError("Ban khong co quyen xem bao cao nay", 403);
}

export async function createPeriodicReport(
    actorUser: IUser,
    input: CreatePeriodicReportInput,
) {
    const neighborhood = await resolveReportNeighborhood(
        actorUser,
        input.neighborhoodId,
    );
    if (input.submittedToUserId) {
        await assertValidWardRecipient(input.submittedToUserId, neighborhood);
    }
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    const report = await PeriodicReport.create({
        type: input.type,
        periodStart,
        periodEnd,
        authorUserId: actorUser._id,
        neighborhoodId: neighborhood._id,
        sections: input.sections,
        autoSummary: await buildPeriodicReportAutoSummary(
            neighborhood._id,
            periodStart,
            periodEnd,
        ),
        submittedToUserId: input.submittedToUserId,
        status: "draft",
    });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.create",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { type: report.type, neighborhoodId: neighborhood._id },
    });
    return report;
}

export async function listMyPeriodicReports(
    actorUser: IUser,
    params: { page: number; limit: number; status?: string },
) {
    const filter: Record<string, unknown> = { authorUserId: actorUser._id };
    if (params.status) filter.status = params.status;
    const [items, total] = await Promise.all([
        PeriodicReport.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("submittedToUserId", "displayName")
            .populate("neighborhoodId", "code name wardCode wardName"),
        PeriodicReport.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function listReceivedPeriodicReports(
    actorUser: IUser,
    params: { page: number; limit: number; status?: string },
) {
    const filter: Record<string, unknown> = { submittedToUserId: actorUser._id };
    if (params.status) filter.status = params.status;
    const [items, total] = await Promise.all([
        PeriodicReport.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("authorUserId", "displayName phone")
            .populate("neighborhoodId", "code name wardCode wardName"),
        PeriodicReport.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getPeriodicReportById(actorUser: IUser, id: string) {
    const report = await getReportInScope(actorUser, id);
    await report.populate("authorUserId", "displayName phone");
    await report.populate("submittedToUserId", "displayName roles wardCode wardName");
    await report.populate("neighborhoodId", "code name wardCode wardName");
    const [attachments, versions] = await Promise.all([
        FileAsset.find({ relatedModel: "PeriodicReport", relatedId: report._id })
            .sort({ createdAt: -1 })
            .populate("uploadedBy", "displayName"),
        PeriodicReportVersion.find({ reportId: report._id })
            .sort({ version: -1 })
            .select("version submittedAt submittedByUserId")
            .populate("submittedByUserId", "displayName"),
    ]);
    return { ...report.toObject(), attachments, versions };
}

export async function updatePeriodicReport(
    actorUser: IUser,
    id: string,
    patch: UpdatePeriodicReportInput,
) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    assertIsAuthor(report, actorUser);
    if (!EDITABLE_STATUSES.includes(report.status)) {
        throw new HttpError("Bao cao da nop, khong the chinh sua truc tiep", 409);
    }

    const neighborhood = await resolveReportNeighborhood(
        actorUser,
        patch.neighborhoodId || String(report.neighborhoodId || ""),
    );
    const periodStart = patch.periodStart
        ? new Date(patch.periodStart)
        : report.periodStart;
    const periodEnd = patch.periodEnd ? new Date(patch.periodEnd) : report.periodEnd;
    if (periodStart > periodEnd) {
        throw new HttpError("Ngay bat dau phai truoc hoac bang ngay ket thuc", 422);
    }
    const recipientId =
        patch.submittedToUserId !== undefined
            ? patch.submittedToUserId
            : report.submittedToUserId
              ? String(report.submittedToUserId)
              : undefined;
    if (recipientId) await assertValidWardRecipient(recipientId, neighborhood);

    if (patch.type !== undefined) report.type = patch.type;
    report.periodStart = periodStart;
    report.periodEnd = periodEnd;
    report.neighborhoodId = neighborhood._id;
    if (patch.submittedToUserId !== undefined) {
        report.submittedToUserId = patch.submittedToUserId as any;
    }
    if (patch.sections !== undefined) {
        report.sections = { ...report.sections, ...patch.sections };
    }
    report.autoSummary = await buildPeriodicReportAutoSummary(
        neighborhood._id,
        periodStart,
        periodEnd,
    );
    await report.save();
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.update",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { changedFields: Object.keys(patch) },
    });
    return report;
}

export async function refreshPeriodicReportSummary(actorUser: IUser, id: string) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    assertIsAuthor(report, actorUser);
    if (!EDITABLE_STATUSES.includes(report.status)) {
        throw new HttpError("Chi cap nhat so lieu khi bao cao dang duoc soan", 409);
    }
    if (!report.neighborhoodId) throw new HttpError("Bao cao chua gan To dan pho", 409);
    report.autoSummary = await buildPeriodicReportAutoSummary(
        report.neighborhoodId,
        report.periodStart,
        report.periodEnd,
    );
    await report.save();
    return report;
}

export async function submitPeriodicReport(actorUser: IUser, id: string) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    assertIsAuthor(report, actorUser);
    if (!EDITABLE_STATUSES.includes(report.status)) {
        throw new HttpError("Bao cao nay khong o trang thai co the nop", 409);
    }
    if (!report.neighborhoodId) throw new HttpError("Bao cao chua gan To dan pho", 422);
    const neighborhood = await assertNeighborhoodInAuthorScope(
        actorUser,
        String(report.neighborhoodId),
    );
    await assertValidWardRecipient(
        report.submittedToUserId ? String(report.submittedToUserId) : undefined,
        neighborhood,
    );

    report.autoSummary = await buildPeriodicReportAutoSummary(
        report.neighborhoodId,
        report.periodStart,
        report.periodEnd,
    );
    const attachments = await FileAsset.find({
        relatedModel: "PeriodicReport",
        relatedId: report._id,
    });
    const version = report.currentVersion + 1;
    const submittedAt = new Date();
    await PeriodicReportVersion.create({
        reportId: report._id,
        version,
        type: report.type,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        authorUserId: report.authorUserId,
        submittedByUserId: actorUser._id,
        submittedToUserId: report.submittedToUserId,
        neighborhoodId: report.neighborhoodId,
        sections: JSON.parse(JSON.stringify(report.sections)),
        autoSummary: JSON.parse(JSON.stringify(report.autoSummary)),
        attachments: attachments.map(file => ({
            fileAssetId: file._id,
            name: file.name,
            url: file.url,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
        })),
        submittedAt,
    });
    report.status = "submitted";
    report.currentVersion = version;
    report.submittedAt = submittedAt;
    report.receivedAt = undefined;
    report.receivedByUserId = undefined;
    report.acceptedAt = undefined;
    report.acceptedByUserId = undefined;
    await report.save();

    await createNotification({
        title: "Co bao cao moi",
        body: `${actorUser.displayName} da nop bao cao v${version}`,
        type: "periodic_report.submitted",
        targetUserIds: [report.submittedToUserId!],
        relatedModel: "PeriodicReport",
        relatedId: report._id,
        createdBy: actorUser._id,
    });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.submit",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { status: report.status, version },
    });
    return report;
}

export async function receivePeriodicReport(actorUser: IUser, id: string) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    await assertIsReceiver(report, actorUser);
    if (!SUBMITTED_STATUSES.includes(report.status)) {
        throw new HttpError("Chi tiep nhan bao cao da nop", 409);
    }
    report.status = "received";
    report.receivedAt = new Date();
    report.receivedByUserId = actorUser._id;
    await report.save();
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.receive",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { version: report.currentVersion },
    });
    return report;
}

export async function acceptPeriodicReport(actorUser: IUser, id: string) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    await assertIsReceiver(report, actorUser);
    if (report.status !== "received") {
        throw new HttpError("Bao cao phai duoc tiep nhan truoc khi chap nhan", 409);
    }
    report.status = "accepted";
    report.acceptedAt = new Date();
    report.acceptedByUserId = actorUser._id;
    await report.save();
    await createNotification({
        title: "Bao cao da duoc chap nhan",
        body: `Bao cao v${report.currentVersion} da duoc Phuong chap nhan`,
        type: "periodic_report.accepted",
        targetUserIds: [report.authorUserId],
        relatedModel: "PeriodicReport",
        relatedId: report._id,
        createdBy: actorUser._id,
    });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.accept",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { version: report.currentVersion },
    });
    return report;
}

export async function recallPeriodicReport(actorUser: IUser, id: string) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    assertIsAuthor(report, actorUser);
    if (!SUBMITTED_STATUSES.includes(report.status)) {
        throw new HttpError("Chi thu hoi bao cao chua duoc Phuong tiep nhan", 409);
    }
    report.status = "recalled";
    report.recalledAt = new Date();
    await report.save();
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.recall",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { version: report.currentVersion },
    });
    return report;
}

export async function requestPeriodicReportRevision(
    actorUser: IUser,
    id: string,
    note: string,
) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    await assertIsReceiver(report, actorUser);
    if (![...SUBMITTED_STATUSES, "received"].includes(report.status)) {
        throw new HttpError("Chi yeu cau bo sung khi bao cao da duoc nop", 409);
    }
    report.status = "revision_required";
    report.revisionNote = note;
    report.revisionRequestedAt = new Date();
    report.revisionRequestedByUserId = actorUser._id;
    await report.save();
    await createNotification({
        title: "Bao cao can bo sung",
        body: note,
        type: "periodic_report.revision_requested",
        targetUserIds: [report.authorUserId],
        relatedModel: "PeriodicReport",
        relatedId: report._id,
        createdBy: actorUser._id,
    });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.request_revision",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { note, version: report.currentVersion },
    });
    return report;
}

export async function listPeriodicReportAttachments(actorUser: IUser, id: string) {
    await getReportInScope(actorUser, id);
    return FileAsset.find({ relatedModel: "PeriodicReport", relatedId: id })
        .sort({ createdAt: -1 })
        .populate("uploadedBy", "displayName");
}

export async function uploadPeriodicReportAttachment(
    actorUser: IUser,
    id: string,
    file: File,
) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    assertIsAuthor(report, actorUser);
    if (!EDITABLE_STATUSES.includes(report.status)) {
        throw new HttpError("Khong the thay doi tep sau khi nop bao cao", 409);
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new HttpError("File vuot qua dung luong cho phep (10MB)", 422);
    }
    const dotIndex = file.name.lastIndexOf(".");
    const ext = dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : "";
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
        throw new HttpError("Dinh dang file dinh kem khong duoc ho tro", 422);
    }
    const { url } = await saveUploadedFile(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        `periodic-report/${id}`,
    );
    const asset = await FileAsset.create({
        name: file.name,
        url,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        category: "attachment",
        relatedModel: "PeriodicReport",
        relatedId: report._id,
        isPublic: false,
        audienceAll: false,
        targetRoles: [],
        uploadedBy: actorUser._id,
    });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.attachment.upload",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { fileAssetId: asset._id, name: asset.name },
    });
    return asset;
}

export async function deletePeriodicReportAttachment(
    actorUser: IUser,
    id: string,
    fileId: string,
) {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    assertIsAuthor(report, actorUser);
    if (!EDITABLE_STATUSES.includes(report.status)) {
        throw new HttpError("Khong the thay doi tep sau khi nop bao cao", 409);
    }
    const asset = await FileAsset.findOne({
        _id: fileId,
        relatedModel: "PeriodicReport",
        relatedId: report._id,
    });
    if (!asset) throw new HttpError("Khong tim thay file dinh kem", 404);
    await deleteUploadedFile(asset.url);
    await asset.deleteOne();
    await writeAuditLog({
        actorId: actorUser._id,
        action: "periodic_report.attachment.delete",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { fileAssetId: fileId, name: asset.name },
    });
}

export async function getPeriodicReportVersionForExport(
    actorUser: IUser,
    id: string,
    version?: number,
) {
    const report = await getReportInScope(actorUser, id);
    const targetVersion = version || report.currentVersion;
    if (targetVersion < 1) {
        throw new HttpError("Bao cao chua co phien ban da nop de xuat", 409);
    }
    const snapshot = await PeriodicReportVersion.findOne({
        reportId: report._id,
        version: targetVersion,
    })
        .populate("authorUserId", "displayName")
        .populate("submittedToUserId", "displayName")
        .populate("neighborhoodId", "code name wardName");
    if (!snapshot) throw new HttpError("Khong tim thay phien ban bao cao", 404);
    return snapshot;
}
