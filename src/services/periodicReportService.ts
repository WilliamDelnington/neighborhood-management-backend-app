import {
    PeriodicReport,
    User,
    type IPeriodicReport,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreatePeriodicReportInput,
    UpdatePeriodicReportInput,
} from "@/validators/periodicReport";

function assertIsAuthor(report: IPeriodicReport, actorUser: IUser): void {
    if (actorUser.roles.includes("admin")) return;
    if (String(report.authorUserId) !== String(actorUser._id)) {
        throw new HttpError(
            "Chi tac gia bao cao nay moi duoc thao tac",
            403,
        );
    }
}

const EDITABLE_STATUSES = ["draft", "revision_requested"];

export async function createPeriodicReport(
    actorUser: IUser,
    input: CreatePeriodicReportInput,
): Promise<IPeriodicReport> {
    const report = await PeriodicReport.create({
        type: input.type,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        authorUserId: actorUser._id,
        neighborhoodId: input.neighborhoodId,
        sections: input.sections,
        submittedToUserId: input.submittedToUserId,
        status: "draft",
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "periodic_report.create",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { type: report.type },
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
            .populate("neighborhoodId", "code name"),
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

/**
 * Bao cao ma actor la nguoi nhan (submittedToUserId) - dung cho man "Bao cao
 * gui cho toi" cua Phuong.
 */
export async function listReceivedPeriodicReports(
    actorUser: IUser,
    params: { page: number; limit: number; status?: string },
) {
    const filter: Record<string, unknown> = {
        submittedToUserId: actorUser._id,
    };
    if (params.status) filter.status = params.status;

    const [items, total] = await Promise.all([
        PeriodicReport.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("authorUserId", "displayName phone")
            .populate("neighborhoodId", "code name"),
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

async function getReportInScope(
    actorUser: IUser,
    id: string,
): Promise<IPeriodicReport> {
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

export async function getPeriodicReportById(
    actorUser: IUser,
    id: string,
): Promise<IPeriodicReport> {
    const report = await getReportInScope(actorUser, id);
    await report.populate("authorUserId", "displayName phone");
    await report.populate("submittedToUserId", "displayName");
    await report.populate("neighborhoodId", "code name");
    return report;
}

export async function updatePeriodicReport(
    actorUser: IUser,
    id: string,
    patch: UpdatePeriodicReportInput,
): Promise<IPeriodicReport> {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    assertIsAuthor(report, actorUser);
    if (!EDITABLE_STATUSES.includes(report.status)) {
        throw new HttpError(
            "Bao cao da nop, khong the chinh sua truc tiep",
            400,
        );
    }

    if (patch.type !== undefined) report.type = patch.type;
    if (patch.periodStart !== undefined)
        report.periodStart = new Date(patch.periodStart);
    if (patch.periodEnd !== undefined)
        report.periodEnd = new Date(patch.periodEnd);
    if (patch.neighborhoodId !== undefined)
        report.neighborhoodId = patch.neighborhoodId as any;
    if (patch.submittedToUserId !== undefined)
        report.submittedToUserId = patch.submittedToUserId as any;
    if (patch.sections !== undefined) {
        report.sections = { ...report.sections, ...patch.sections };
    }
    await report.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "periodic_report.update",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: patch,
    });

    return report;
}

/**
 * "draft" -> "submitted" (lan dau), hoac "revision_requested" -> "resubmitted"
 * (sau khi tac gia bo sung theo yeu cau). Da "submitted"/"resubmitted" roi
 * thi khong goi lai duoc (phai cho nguoi nhan yeu cau bo sung truoc).
 */
export async function submitPeriodicReport(
    actorUser: IUser,
    id: string,
): Promise<IPeriodicReport> {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    assertIsAuthor(report, actorUser);

    if (report.status === "draft") {
        report.status = "submitted";
    } else if (report.status === "revision_requested") {
        report.status = "resubmitted";
    } else {
        throw new HttpError("Bao cao nay da duoc nop truoc do", 400);
    }
    report.submittedAt = new Date();
    await report.save();

    if (report.submittedToUserId) {
        await createNotification({
            title: "Có báo cáo mới",
            body: `${actorUser.displayName} đã nộp một báo cáo`,
            type: "periodic_report.submitted",
            targetUserIds: [report.submittedToUserId],
            relatedModel: "PeriodicReport",
            relatedId: report._id,
            createdBy: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "periodic_report.submit",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { status: report.status },
    });

    return report;
}

export async function requestPeriodicReportRevision(
    actorUser: IUser,
    id: string,
    note: string,
): Promise<IPeriodicReport> {
    const report = await PeriodicReport.findById(id);
    if (!report) throw new HttpError("Khong tim thay bao cao", 404);
    if (
        !actorUser.roles.includes("admin") &&
        String(report.submittedToUserId) !== String(actorUser._id)
    ) {
        throw new HttpError(
            "Chi nguoi nhan bao cao nay moi duoc yeu cau bo sung",
            403,
        );
    }
    if (report.status !== "submitted" && report.status !== "resubmitted") {
        throw new HttpError(
            "Chi yeu cau bo sung khi bao cao da duoc nop",
            400,
        );
    }

    report.status = "revision_requested";
    report.revisionNote = note;
    await report.save();

    const author = await User.findById(report.authorUserId).select(
        "displayName",
    );
    await createNotification({
        title: "Báo cáo cần bổ sung",
        body: note,
        type: "periodic_report.revision_requested",
        targetUserIds: [report.authorUserId],
        relatedModel: "PeriodicReport",
        relatedId: report._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "periodic_report.request_revision",
        targetModel: "PeriodicReport",
        targetId: report._id,
        metadata: { note, author: author?.displayName },
    });

    return report;
}
