import { Types } from "mongoose";
import ExcelJS from "exceljs";
import {
    Complaint,
    HouseRecord,
    InspectionCampaign,
    InspectionResult,
    InspectionTarget,
    KpiDefinition,
    Neighborhood,
    NotificationDelivery,
    Request as RequestModel,
    RequestRecipient,
    User,
    type IKpiDefinition,
    type IUser,
} from "@/models";
import { addTableSheet } from "@/lib/excelResponse";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    KpiDataSource,
    KpiFormulaType,
    KpiPeriod,
} from "@/types";
import type {
    CreateKpiDefinitionInput,
    UpdateKpiDefinitionInput,
} from "@/validators/kpiDefinition";

export const KPI_SOURCE_LABELS: Record<KpiDataSource, string> = {
    task_completion: "Tỷ lệ nhiệm vụ hoàn thành",
    task_on_time: "Tỷ lệ nhiệm vụ đúng hạn",
    feedback_sla: "Tỷ lệ phản ánh đạt SLA",
    inspection_completion: "Tỷ lệ hoàn thành rà soát",
    house_response: "Tỷ lệ Nhà số phản hồi tự khai",
    notification_read: "Tỷ lệ đọc thông báo",
};

type KpiRawMetric = {
    numerator: number;
    denominator: number;
    sum?: number;
    count?: number;
    detail: string;
};

type KpiScope = {
    neighborhoodIds?: Types.ObjectId[];
    userIds?: Types.ObjectId[];
    houseIds?: Types.ObjectId[];
};

function actorNeighborhoodIds(actorUser: IUser) {
    return [
        actorUser.neighborhoodId,
        ...(actorUser.assignedNeighborhoodIds || []),
    ].filter(Boolean) as Types.ObjectId[];
}

async function resolveKpiScope(actorUser: IUser, neighborhoodId?: string): Promise<KpiScope> {
    let neighborhoodIds: Types.ObjectId[] | undefined;
    if (neighborhoodId) {
        if (!Types.ObjectId.isValid(neighborhoodId)) {
            throw new HttpError("To dan pho khong hop le", 422);
        }
        const neighborhood = await Neighborhood.findById(neighborhoodId).select("wardCode");
        if (!neighborhood) throw new HttpError("Khong tim thay To dan pho", 404);
        const assigned = actorNeighborhoodIds(actorUser).map(String);
        if (
            !actorUser.roles.includes("admin") &&
            !(
                actorUser.wardCode && neighborhood.wardCode === actorUser.wardCode
            ) &&
            !assigned.includes(neighborhoodId)
        ) {
            throw new HttpError("To dan pho nam ngoai pham vi bao cao", 403);
        }
        neighborhoodIds = [new Types.ObjectId(neighborhoodId)];
    } else if (!actorUser.roles.includes("admin")) {
        if (actorUser.wardCode) {
            neighborhoodIds = await Neighborhood.distinct("_id", {
                wardCode: actorUser.wardCode,
            });
        } else {
            neighborhoodIds = actorNeighborhoodIds(actorUser);
        }
    }

    if (!neighborhoodIds) return {};
    if (neighborhoodIds.length === 0) {
        return { neighborhoodIds: [], userIds: [], houseIds: [] };
    }
    const [userIds, houseIds] = await Promise.all([
        User.distinct("_id", {
            $or: [
                { neighborhoodId: { $in: neighborhoodIds } },
                { assignedNeighborhoodIds: { $in: neighborhoodIds } },
            ],
        }),
        HouseRecord.distinct("_id", { neighborhoodId: { $in: neighborhoodIds } }),
    ]);
    return { neighborhoodIds, userIds, houseIds };
}

function range(from: Date, to: Date) {
    return { $gte: from, $lte: to };
}

function currentPeriodBounds(period: KpiPeriod, now = new Date()) {
    const end = new Date(now);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === "weekly") {
        const day = start.getDay() || 7;
        start.setDate(start.getDate() - day + 1);
    } else if (period === "monthly") {
        start.setDate(1);
    } else if (period === "quarterly") {
        start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    } else {
        start.setMonth(0, 1);
    }
    return { from: start, to: end };
}

async function taskMetric(
    scope: KpiScope,
    from: Date,
    to: Date,
    source: "task_completion" | "task_on_time",
): Promise<KpiRawMetric> {
    const filter: Record<string, unknown> = { createdAt: range(from, to) };
    if (scope.userIds) filter.userId = { $in: scope.userIds };
    const assignments = await RequestRecipient.find(filter).select(
        "requestId resolvedAt createdAt",
    );
    const requests = await RequestModel.find({
        _id: { $in: assignments.map(row => row.requestId) },
    }).select("dueDate");
    const requestById = new Map(requests.map(row => [String(row._id), row]));
    if (source === "task_on_time") {
        const withDeadline = assignments.filter(row =>
            Boolean(requestById.get(String(row.requestId))?.dueDate),
        );
        const onTime = withDeadline.filter(row => {
            const dueDate = requestById.get(String(row.requestId))?.dueDate;
            return Boolean(row.resolvedAt && dueDate && row.resolvedAt <= dueDate && row.resolvedAt <= to);
        });
        return {
            numerator: onTime.length,
            denominator: withDeadline.length,
            detail: `${onTime.length}/${withDeadline.length} lượt có hạn hoàn thành đúng hạn`,
        };
    }
    const completed = assignments.filter(row => row.resolvedAt && row.resolvedAt <= to);
    const resolutionDays = completed.reduce(
        (total, row) =>
            total + ((row.resolvedAt?.getTime() || 0) - row.createdAt.getTime()) / 86_400_000,
        0,
    );
    return {
        numerator: completed.length,
        denominator: assignments.length,
        sum: resolutionDays,
        count: completed.length,
        detail: `${completed.length}/${assignments.length} lượt giao đã hoàn thành`,
    };
}

async function feedbackSlaMetric(scope: KpiScope, from: Date, to: Date): Promise<KpiRawMetric> {
    const filter: Record<string, unknown> = {
        actualCompletionDate: range(from, to),
        expectedCompletionDate: { $exists: true, $ne: null },
    };
    if (scope.neighborhoodIds) {
        filter.neighborhoodId = { $in: scope.neighborhoodIds };
    }
    const rows = await Complaint.find(filter).select(
        "actualCompletionDate expectedCompletionDate",
    );
    const met = rows.filter(
        row =>
            row.actualCompletionDate &&
            row.expectedCompletionDate &&
            row.actualCompletionDate <= row.expectedCompletionDate,
    ).length;
    return {
        numerator: met,
        denominator: rows.length,
        detail: `${met}/${rows.length} phản ánh hoàn thành trong SLA`,
    };
}

async function inspectionMetric(scope: KpiScope, from: Date, to: Date): Promise<KpiRawMetric> {
    const campaigns = await InspectionCampaign.find({ dueAt: range(from, to) }).select("_id");
    const filter: Record<string, unknown> = {
        campaignId: { $in: campaigns.map(row => row._id) },
    };
    if (scope.neighborhoodIds) filter.neighborhoodId = { $in: scope.neighborhoodIds };
    const targets = await InspectionTarget.find(filter).select("resultStatus");
    const completed = targets.filter(row => row.resultStatus === "VERIFIED").length;
    return {
        numerator: completed,
        denominator: targets.length,
        detail: `${completed}/${targets.length} Nhà số đã được xác minh`,
    };
}

async function houseResponseMetric(scope: KpiScope, from: Date, to: Date): Promise<KpiRawMetric> {
    const filter: Record<string, unknown> = {
        selfDeclarationSentAt: range(from, to),
    };
    if (scope.neighborhoodIds) filter.neighborhoodId = { $in: scope.neighborhoodIds };
    const targets = await InspectionTarget.find(filter).select("_id");
    const submitted = targets.length
        ? await InspectionResult.countDocuments({
              targetId: { $in: targets.map(row => row._id) },
              submittedBy: "HOUSE",
              submittedAt: { $lte: to },
          })
        : 0;
    return {
        numerator: submitted,
        denominator: targets.length,
        detail: `${submitted}/${targets.length} Nhà số đã phản hồi biểu mẫu`,
    };
}

async function notificationReadMetric(scope: KpiScope, from: Date, to: Date): Promise<KpiRawMetric> {
    const filter: Record<string, unknown> = { createdAt: range(from, to) };
    if (scope.userIds) filter.userId = { $in: scope.userIds };
    const deliveries = await NotificationDelivery.find(filter).select("readAt");
    const read = deliveries.filter(row => row.readAt && row.readAt <= to).length;
    return {
        numerator: read,
        denominator: deliveries.length,
        detail: `${read}/${deliveries.length} lượt gửi đã được đọc`,
    };
}

async function rawMetric(
    source: KpiDataSource,
    scope: KpiScope,
    from: Date,
    to: Date,
) {
    if (source === "task_completion" || source === "task_on_time") {
        return taskMetric(scope, from, to, source);
    }
    if (source === "feedback_sla") return feedbackSlaMetric(scope, from, to);
    if (source === "inspection_completion") return inspectionMetric(scope, from, to);
    if (source === "house_response") return houseResponseMetric(scope, from, to);
    return notificationReadMetric(scope, from, to);
}

function calculateValue(formula: KpiFormulaType, metric: KpiRawMetric) {
    if (formula === "count") return metric.numerator;
    if (formula === "average") {
        return metric.count ? Number(((metric.sum || 0) / metric.count).toFixed(2)) : null;
    }
    return metric.denominator
        ? Number(((metric.numerator / metric.denominator) * 100).toFixed(2))
        : null;
}

function definitionFilter(actorUser: IUser) {
    if (actorUser.roles.includes("admin")) return {};
    if (actorUser.wardCode) {
        return { $or: [{ wardCode: actorUser.wardCode }, { wardCode: { $exists: false } }] };
    }
    return { wardCode: { $exists: false } };
}

export async function listKpiDefinitions(
    actorUser: IUser,
    params: { page: number; limit: number; active?: boolean },
) {
    const filter: Record<string, unknown> = { ...definitionFilter(actorUser) };
    if (params.active !== undefined) filter.active = params.active;
    const [items, total] = await Promise.all([
        KpiDefinition.find(filter)
            .sort({ active: -1, code: 1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        KpiDefinition.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

function assertFormulaSupported(source: KpiDataSource, formula: KpiFormulaType) {
    if (formula === "average" && source !== "task_completion") {
        throw new HttpError("Cong thuc trung binh hien chi ho tro nguon Nhiem vu hoan thanh", 422);
    }
}

export async function createKpiDefinition(actorUser: IUser, input: CreateKpiDefinitionInput) {
    assertFormulaSupported(input.dataSource, input.formulaType);
    const wardCode = actorUser.roles.includes("admin") ? undefined : actorUser.wardCode;
    if (!actorUser.roles.includes("admin") && !wardCode) {
        throw new HttpError("Tai khoan chua duoc gan Phuong de cau hinh KPI", 403);
    }
    try {
        const definition = await KpiDefinition.create({
            ...input,
            wardCode,
            createdBy: actorUser._id,
        });
        await writeAuditLog({
            actorId: actorUser._id,
            action: "kpi_definition.create",
            targetModel: "KpiDefinition",
            targetId: definition._id,
            metadata: { code: definition.code, dataSource: definition.dataSource },
        });
        return definition;
    } catch (err: any) {
        if (err?.code === 11000) throw new HttpError("Ma KPI da ton tai trong pham vi nay", 409);
        throw err;
    }
}

export async function updateKpiDefinition(
    actorUser: IUser,
    id: string,
    patch: UpdateKpiDefinitionInput,
) {
    const definition = await KpiDefinition.findById(id);
    if (!definition) throw new HttpError("Khong tim thay KPI", 404);
    if (
        !actorUser.roles.includes("admin") &&
        definition.wardCode !== actorUser.wardCode
    ) {
        throw new HttpError("KPI nam ngoai Phuong duoc phu trach", 403);
    }
    assertFormulaSupported(
        patch.dataSource || definition.dataSource,
        patch.formulaType || definition.formulaType,
    );
    Object.assign(definition, patch, {
        updatedBy: actorUser._id,
        version: definition.version + 1,
    });
    await definition.save();
    await writeAuditLog({
        actorId: actorUser._id,
        action: "kpi_definition.update",
        targetModel: "KpiDefinition",
        targetId: definition._id,
        metadata: { changedFields: Object.keys(patch), version: definition.version },
    });
    return definition;
}

export async function archiveKpiDefinition(actorUser: IUser, id: string) {
    return updateKpiDefinition(actorUser, id, { active: false });
}

export async function evaluateKpis(
    actorUser: IUser,
    options: { fromDate?: Date; toDate?: Date; neighborhoodId?: string } = {},
) {
    const definitions = await KpiDefinition.find({
        ...definitionFilter(actorUser),
        active: true,
    }).sort({ code: 1 });
    const scope = await resolveKpiScope(actorUser, options.neighborhoodId);
    const items = [];
    for (const definition of definitions) {
        const ownRange = currentPeriodBounds(definition.period);
        const from = options.fromDate || ownRange.from;
        const to = options.toDate || ownRange.to;
        const metric = await rawMetric(definition.dataSource, scope, from, to);
        const value = calculateValue(definition.formulaType, metric);
        items.push({
            definition,
            fromDate: from,
            toDate: to,
            value,
            targetMet:
                value === null
                    ? null
                    : definition.targetDirection === "gte"
                      ? value >= definition.targetValue
                      : value <= definition.targetValue,
            numerator: metric.numerator,
            denominator: metric.denominator,
            detail: metric.detail,
        });
    }
    return { generatedAt: new Date(), items };
}

export function buildKpiWorkbook(
    data: Awaited<ReturnType<typeof evaluateKpis>>,
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    addTableSheet(
        workbook,
        "KPI",
        [
            { header: "Ma KPI", key: "code", width: 22 },
            { header: "Ten KPI", key: "name", width: 36 },
            { header: "Tu ngay", key: "fromDate", width: 16 },
            { header: "Den ngay", key: "toDate", width: 16 },
            { header: "Gia tri", key: "value", width: 15 },
            { header: "Muc tieu", key: "target", width: 15 },
            { header: "Dat", key: "targetMet", width: 12 },
            { header: "Chi tiet", key: "detail", width: 45 },
        ],
        data.items.map(item => ({
            code: item.definition.code,
            name: item.definition.name,
            fromDate: item.fromDate.toISOString().slice(0, 10),
            toDate: item.toDate.toISOString().slice(0, 10),
            value: item.value ?? "Khong co du lieu",
            target: `${item.definition.targetDirection === "gte" ? ">=" : "<="} ${item.definition.targetValue} ${item.definition.unit}`,
            targetMet: item.targetMet === null ? "N/A" : item.targetMet ? "Co" : "Khong",
            detail: item.detail,
        })),
    );
    return workbook;
}

export async function getKpiExportData(
    actorUser: IUser,
    options: { fromDate?: Date; toDate?: Date; neighborhoodId?: string },
) {
    return evaluateKpis(actorUser, options);
}
