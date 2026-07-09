import mongoose from "mongoose";
import ExcelJS from "exceljs";
import {
    Household,
    Citizen,
    Complaint,
    PcccCheck,
    SecurityRecord,
    FinanceTransaction,
    Meeting,
    MeetingRegistration,
} from "@/models";
import { HttpError } from "@/lib/response";
import { addSummarySheet, addTableSheet } from "@/lib/excelResponse";
import { getSurveyResults } from "@/services/surveyService";
import {
    LOAI_CU_TRU_LABEL,
    NHOM_PHAN_ANH_LABEL,
    TRANG_THAI_PHAN_ANH_LABEL,
    MUC_NGUY_CO_PCCC_LABEL,
    MUC_DO_AN_NINH_LABEL,
    DANG_KY_HOP_LABEL,
    type LoaiCuTru,
    type NhomPhanAnh,
    type TrangThaiPhanAnh,
    type MucNguyCoPccc,
    type MucDoAnNinh,
    type DangKyHop,
} from "@/types";

// ---------------------------------------------------------------------------
// 1. Bao cao dan cu
// ---------------------------------------------------------------------------

export type PopulationReport = {
    totalHouseholds: number;
    totalCitizens: number;
    byCluster: {
        cluster: string;
        householdCount: number;
        citizenCount: number;
    }[];
    byResidenceType: { residenceType: string; label: string; count: number }[];
    elderlyCount: number;
    childCount: number;
    disabledOrSupportNeededCount: number;
    partyMemberCount: number;
    unionMemberCount: number;
};

export async function getPopulationReport(): Promise<PopulationReport> {
    const [
        totalHouseholds,
        totalCitizens,
        byClusterRaw,
        byResidenceTypeRaw,
        elderlyCount,
        childCount,
        disabledOrSupportNeededCount,
        partyMemberCount,
        unionMemberCount,
    ] = await Promise.all([
        Household.countDocuments(),
        Citizen.countDocuments(),
        Household.aggregate([
            {
                $lookup: {
                    from: "citizens",
                    localField: "_id",
                    foreignField: "householdId",
                    as: "citizens",
                },
            },
            {
                $group: {
                    _id: "$cluster",
                    householdCount: { $sum: 1 },
                    citizenCount: { $sum: { $size: "$citizens" } },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        Citizen.aggregate([
            { $group: { _id: "$residenceType", count: { $sum: 1 } } },
        ]),
        Citizen.countDocuments({ isElderly: true }),
        Citizen.countDocuments({ isChild: true }),
        Citizen.countDocuments({ isDisabledOrSupportNeeded: true }),
        Citizen.countDocuments({ isPartyMember: true }),
        Citizen.countDocuments({ isUnionMember: true }),
    ]);

    return {
        totalHouseholds,
        totalCitizens,
        byCluster: byClusterRaw.map(r => ({
            cluster: r._id ?? "Chưa xác định",
            householdCount: r.householdCount,
            citizenCount: r.citizenCount,
        })),
        byResidenceType: byResidenceTypeRaw.map(r => ({
            residenceType: r._id,
            label: LOAI_CU_TRU_LABEL[r._id as LoaiCuTru] ?? String(r._id),
            count: r.count,
        })),
        elderlyCount,
        childCount,
        disabledOrSupportNeededCount,
        partyMemberCount,
        unionMemberCount,
    };
}

export function buildPopulationReportWorkbook(
    data: PopulationReport,
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    addSummarySheet(workbook, "Tong quan", [
        { label: "Tổng số hộ dân", value: data.totalHouseholds },
        { label: "Tổng số nhân khẩu", value: data.totalCitizens },
        { label: "Số người cao tuổi", value: data.elderlyCount },
        { label: "Số trẻ em", value: data.childCount },
        {
            label: "Số người khuyết tật/cần hỗ trợ",
            value: data.disabledOrSupportNeededCount,
        },
        { label: "Số đảng viên", value: data.partyMemberCount },
        { label: "Số đoàn viên/hội viên", value: data.unionMemberCount },
    ]);
    addTableSheet(
        workbook,
        "Theo cụm dân cư",
        [
            { header: "Cụm dân cư", key: "cluster", width: 30 },
            { header: "Số hộ", key: "householdCount", width: 15 },
            { header: "Số nhân khẩu", key: "citizenCount", width: 15 },
        ],
        data.byCluster,
    );
    addTableSheet(
        workbook,
        "Theo cư trú",
        [
            { header: "Loại cư trú", key: "label", width: 25 },
            { header: "Số lượng", key: "count", width: 15 },
        ],
        data.byResidenceType,
    );
    return workbook;
}

// ---------------------------------------------------------------------------
// 2. Bao cao phan anh kien nghi
// ---------------------------------------------------------------------------

export type ComplaintReportParams = { fromDate?: Date; toDate?: Date };

export type ComplaintReport = {
    byCategory: { category: string; label: string; count: number }[];
    byStatus: { status: string; label: string; count: number }[];
    averageResolutionDays: number | null;
    resolvedWithDurationCount: number;
    escalatedToCommitteeCount: number;
};

export async function getComplaintReport(
    params: ComplaintReportParams,
): Promise<ComplaintReport> {
    const match: Record<string, unknown> = {};
    if (params.fromDate || params.toDate) {
        const range: Record<string, Date> = {};
        if (params.fromDate) range.$gte = params.fromDate;
        if (params.toDate) range.$lte = params.toDate;
        match.createdAt = range;
    }

    const [byCategoryRaw, byStatusRaw, resolutionAgg, escalatedCount] =
        await Promise.all([
            Complaint.aggregate([
                { $match: match },
                { $group: { _id: "$category", count: { $sum: 1 } } },
            ]),
            Complaint.aggregate([
                { $match: match },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
            Complaint.aggregate([
                {
                    $match: {
                        ...match,
                        actualCompletionDate: { $exists: true, $ne: null },
                    },
                },
                {
                    $project: {
                        resolutionDays: {
                            $divide: [
                                {
                                    $subtract: [
                                        "$actualCompletionDate",
                                        "$createdAt",
                                    ],
                                },
                                1000 * 60 * 60 * 24,
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        avgDays: { $avg: "$resolutionDays" },
                        count: { $sum: 1 },
                    },
                },
            ]),
            Complaint.countDocuments({ ...match, escalatedToCommittee: true }),
        ]);

    return {
        byCategory: byCategoryRaw.map(r => ({
            category: r._id,
            label: NHOM_PHAN_ANH_LABEL[r._id as NhomPhanAnh] ?? String(r._id),
            count: r.count,
        })),
        byStatus: byStatusRaw.map(r => ({
            status: r._id,
            label:
                TRANG_THAI_PHAN_ANH_LABEL[r._id as TrangThaiPhanAnh] ??
                String(r._id),
            count: r.count,
        })),
        averageResolutionDays: resolutionAgg[0]?.avgDays ?? null,
        resolvedWithDurationCount: resolutionAgg[0]?.count ?? 0,
        escalatedToCommitteeCount: escalatedCount,
    };
}

export function buildComplaintReportWorkbook(
    data: ComplaintReport,
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    addSummarySheet(workbook, "Tong quan", [
        {
            label: "Thời gian xử lý trung bình (ngày)",
            value:
                data.averageResolutionDays !== null
                    ? data.averageResolutionDays.toFixed(1)
                    : "Chưa có dữ liệu",
        },
        {
            label: "Số phản ánh đã tính thời gian xử lý",
            value: data.resolvedWithDurationCount,
        },
        {
            label: "Số phản ánh đã chuyển UBND phường",
            value: data.escalatedToCommitteeCount,
        },
    ]);
    addTableSheet(
        workbook,
        "Theo nhom",
        [
            { header: "Nhóm phản ánh", key: "label", width: 30 },
            { header: "Số lượng", key: "count", width: 15 },
        ],
        data.byCategory,
    );
    addTableSheet(
        workbook,
        "Theo trang thai",
        [
            { header: "Trạng thái", key: "label", width: 25 },
            { header: "Số lượng", key: "count", width: 15 },
        ],
        data.byStatus,
    );
    return workbook;
}

// ---------------------------------------------------------------------------
// 3. Bao cao PCCC
// ---------------------------------------------------------------------------

export type PcccReport = {
    totalHouseholdsChecked: number;
    byRiskLevel: { riskLevel: string; label: string; count: number }[];
    householdsNeedingRemediation: {
        householdId: string;
        code: string;
        cluster: string;
        address: string;
        headOfHousehold: string;
        remediationNeeded?: string;
    }[];
};

export async function getPcccReport(): Promise<PcccReport> {
    // Lay ban ghi kiem tra MOI NHAT cho tung ho: sap xep theo ho + ngay kiem tra giam dan,
    // group theo householdId lay $first, roi $replaceRoot de lam viec voi document goc.
    const latestChecks = await PcccCheck.aggregate([
        { $sort: { householdId: 1, inspectionDate: -1 } },
        { $group: { _id: "$householdId", latest: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$latest" } },
    ]);

    const byRiskLevelCount: Record<string, number> = {
        xanh: 0,
        vang: 0,
        do: 0,
    };
    const remediationByHouseholdId = new Map<string, string>();
    for (const check of latestChecks) {
        byRiskLevelCount[check.riskLevel] =
            (byRiskLevelCount[check.riskLevel] || 0) + 1;
        if (
            check.remediationNeeded &&
            String(check.remediationNeeded).trim().length > 0
        ) {
            remediationByHouseholdId.set(
                String(check.householdId),
                String(check.remediationNeeded),
            );
        }
    }

    const remediationIds = Array.from(remediationByHouseholdId.keys()).map(
        id => new mongoose.Types.ObjectId(id),
    );
    const households = await Household.find({
        _id: { $in: remediationIds },
    }).select("code cluster address headOfHousehold");

    return {
        totalHouseholdsChecked: latestChecks.length,
        byRiskLevel: (
            Object.keys(MUC_NGUY_CO_PCCC_LABEL) as MucNguyCoPccc[]
        ).map(level => ({
            riskLevel: level,
            label: MUC_NGUY_CO_PCCC_LABEL[level],
            count: byRiskLevelCount[level] || 0,
        })),
        householdsNeedingRemediation: households.map(h => ({
            householdId: String(h._id),
            code: h.code,
            cluster: h.cluster,
            address: h.address,
            headOfHousehold: h.headOfHousehold,
            remediationNeeded: remediationByHouseholdId.get(String(h._id)),
        })),
    };
}

export function buildPcccReportWorkbook(data: PcccReport): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    addSummarySheet(workbook, "Tong quan", [
        {
            label: "Tổng số hộ đã kiểm tra PCCC",
            value: data.totalHouseholdsChecked,
        },
        {
            label: "Số hộ cần khắc phục",
            value: data.householdsNeedingRemediation.length,
        },
    ]);
    addTableSheet(
        workbook,
        "Theo muc nguy co",
        [
            { header: "Mức nguy cơ", key: "label", width: 20 },
            { header: "Số hộ", key: "count", width: 15 },
        ],
        data.byRiskLevel,
    );
    addTableSheet(
        workbook,
        "Ho can khac phuc",
        [
            { header: "Mã hộ", key: "code", width: 12 },
            { header: "Cụm dân cư", key: "cluster", width: 20 },
            { header: "Địa chỉ", key: "address", width: 30 },
            { header: "Chủ hộ", key: "headOfHousehold", width: 25 },
            {
                header: "Việc cần khắc phục",
                key: "remediationNeeded",
                width: 40,
            },
        ],
        data.householdsNeedingRemediation,
    );
    return workbook;
}

// ---------------------------------------------------------------------------
// 4. Bao cao an ninh / tam tru / nha cho thue
// ---------------------------------------------------------------------------

export type SecurityReport = {
    byLevel: { level: string; label: string; count: number }[];
    rentalHouseholdsCount: number;
    rentalMissingDeclarationCount: number;
    reportedToPoliceCount: number;
};

export async function getSecurityReport(): Promise<SecurityReport> {
    const [
        byLevelRaw,
        rentalHouseholdsCount,
        rentalMissingDeclarationCount,
        reportedToPoliceCount,
    ] = await Promise.all([
        SecurityRecord.aggregate([
            { $group: { _id: "$level", count: { $sum: 1 } } },
        ]),
        Household.countDocuments({ ownershipType: "cho_thue" }),
        // Chi bao gom ban ghi an ninh cua nha cho thue nhung CHUA khai bao tam tru
        // -> day la chi so khoang trong tuan thu, khong phai tong so nha cho thue.
        SecurityRecord.countDocuments({
            ownershipType: "cho_thue",
            temporaryResidenceDeclared: false,
        }),
        SecurityRecord.countDocuments({ reportedToPolice: true }),
    ]);

    return {
        byLevel: (Object.keys(MUC_DO_AN_NINH_LABEL) as MucDoAnNinh[]).map(
            level => {
                const found = byLevelRaw.find(r => r._id === level);
                return {
                    level,
                    label: MUC_DO_AN_NINH_LABEL[level],
                    count: found?.count ?? 0,
                };
            },
        ),
        rentalHouseholdsCount,
        rentalMissingDeclarationCount,
        reportedToPoliceCount,
    };
}

export function buildSecurityReportWorkbook(
    data: SecurityReport,
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    addSummarySheet(workbook, "Tong quan", [
        { label: "Tổng số hộ cho thuê", value: data.rentalHouseholdsCount },
        {
            label: "Số hộ cho thuê chưa khai báo tạm trú",
            value: data.rentalMissingDeclarationCount,
        },
        {
            label: "Số vụ đã báo công an khu vực",
            value: data.reportedToPoliceCount,
        },
    ]);
    addTableSheet(
        workbook,
        "Theo muc do",
        [
            { header: "Mức độ", key: "label", width: 20 },
            { header: "Số lượng", key: "count", width: 15 },
        ],
        data.byLevel,
    );
    return workbook;
}

// ---------------------------------------------------------------------------
// 5. Bao cao tai chinh
// ---------------------------------------------------------------------------

export type FinanceReportParams = { fromDate?: Date; toDate?: Date };

export type FinanceReport = {
    totalIncome: number;
    totalExpense: number;
    net: number;
    byMonth: { year: number; month: number; income: number; expense: number }[];
};

export async function getFinanceReport(
    params: FinanceReportParams,
): Promise<FinanceReport> {
    // Judgment call: giao dich co status "da_huy" (da huy) khong duoc tinh vao tong,
    // vi no khong con hieu luc ve mat tai chinh.
    const match: Record<string, unknown> = { status: { $ne: "da_huy" } };
    if (params.fromDate || params.toDate) {
        const range: Record<string, Date> = {};
        if (params.fromDate) range.$gte = params.fromDate;
        if (params.toDate) range.$lte = params.toDate;
        match.transactionDate = range;
    }

    const [totalsRaw, byMonthRaw] = await Promise.all([
        FinanceTransaction.aggregate([
            { $match: match },
            { $group: { _id: "$type", total: { $sum: "$amount" } } },
        ]),
        FinanceTransaction.aggregate([
            { $match: match },
            {
                $group: {
                    _id: {
                        year: { $year: "$transactionDate" },
                        month: { $month: "$transactionDate" },
                        type: "$type",
                    },
                    total: { $sum: "$amount" },
                },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
    ]);

    const totalIncome = totalsRaw.find(t => t._id === "thu")?.total ?? 0;
    const totalExpense = totalsRaw.find(t => t._id === "chi")?.total ?? 0;

    const monthMap = new Map<
        string,
        { year: number; month: number; income: number; expense: number }
    >();
    for (const row of byMonthRaw) {
        const key = `${row._id.year}-${row._id.month}`;
        if (!monthMap.has(key)) {
            monthMap.set(key, {
                year: row._id.year,
                month: row._id.month,
                income: 0,
                expense: 0,
            });
        }
        const entry = monthMap.get(key)!;
        if (row._id.type === "thu") entry.income = row.total;
        else entry.expense = row.total;
    }

    return {
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
        byMonth: Array.from(monthMap.values()).sort(
            (a, b) => a.year - b.year || a.month - b.month,
        ),
    };
}

export function buildFinanceReportWorkbook(
    data: FinanceReport,
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    addSummarySheet(workbook, "Tong quan", [
        { label: "Tổng thu", value: data.totalIncome },
        { label: "Tổng chi", value: data.totalExpense },
        { label: "Chênh lệch thu chi", value: data.net },
    ]);
    addTableSheet(
        workbook,
        "Theo thang",
        [
            { header: "Năm", key: "year", width: 10 },
            { header: "Tháng", key: "month", width: 10 },
            { header: "Thu", key: "income", width: 18 },
            { header: "Chi", key: "expense", width: 18 },
        ],
        data.byMonth,
    );
    return workbook;
}

// ---------------------------------------------------------------------------
// 6. Bao cao diem danh cuoc hop
// ---------------------------------------------------------------------------

export type MeetingAttendanceReport = {
    meetingId: string;
    title: string;
    startTime: Date;
    totalRegistrations: number;
    byAnswer: { answer: string; label: string; count: number }[];
};

export async function getMeetingAttendanceReport(params: {
    meetingId: string;
}): Promise<MeetingAttendanceReport> {
    const meeting = await Meeting.findById(params.meetingId);
    if (!meeting) throw new HttpError("Khong tim thay cuoc hop", 404);

    const byAnswerRaw = await MeetingRegistration.aggregate([
        { $match: { meetingId: meeting._id } },
        { $group: { _id: "$answer", count: { $sum: 1 } } },
    ]);

    const byAnswer = (Object.keys(DANG_KY_HOP_LABEL) as DangKyHop[]).map(
        answer => {
            const found = byAnswerRaw.find(r => r._id === answer);
            return {
                answer,
                label: DANG_KY_HOP_LABEL[answer],
                count: found?.count ?? 0,
            };
        },
    );

    return {
        meetingId: String(meeting._id),
        title: meeting.title,
        startTime: meeting.startTime,
        totalRegistrations: byAnswer.reduce((sum, a) => sum + a.count, 0),
        byAnswer,
    };
}

export function buildMeetingAttendanceReportWorkbook(
    data: MeetingAttendanceReport,
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    addSummarySheet(workbook, "Tong quan", [
        { label: "Cuộc họp", value: data.title },
        { label: "Thời gian", value: data.startTime },
        { label: "Tổng số lượt đăng ký", value: data.totalRegistrations },
    ]);
    addTableSheet(
        workbook,
        "Theo tra loi",
        [
            { header: "Trả lời", key: "label", width: 20 },
            { header: "Số lượng", key: "count", width: 15 },
        ],
        data.byAnswer,
    );
    return workbook;
}

// ---------------------------------------------------------------------------
// 7. Bao cao ket qua khao sat
// ---------------------------------------------------------------------------

export async function getSurveyResultReport(params: { surveyId: string }) {
    // Tai su dung logic tinh ket qua khao sat da co san trong surveyService,
    // khong lam lai tu dau de tranh sai lech giua module Khao sat va module Bao cao.
    return getSurveyResults(params.surveyId);
}

export function buildSurveyResultReportWorkbook(
    data: Awaited<ReturnType<typeof getSurveyResults>>,
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    addSummarySheet(workbook, "Tong quan", [
        { label: "Khảo sát", value: data.title },
        { label: "Tổng số lượt trả lời", value: data.totalResponses },
    ]);

    for (const result of data.results) {
        const rows = Object.entries(result.optionCounts).map(
            ([option, count]) => ({
                option,
                count,
            }),
        );
        if (result.otherTexts.length > 0) {
            rows.push({
                option: "Ý kiến khác (xem chi tiết)",
                count: result.otherTexts.length,
            });
        }
        // Ten sheet Excel gioi han 31 ky tu va khong duoc chua mot so ky tu dac biet.
        const safeSheetName = result.question
            .slice(0, 28)
            .replace(/[*?:/\\[\]]/g, " ");
        addTableSheet(
            workbook,
            safeSheetName || `Cau hoi ${result.questionId.slice(-4)}`,
            [
                { header: "Lựa chọn", key: "option", width: 40 },
                { header: "Số lượt chọn", key: "count", width: 15 },
            ],
            rows,
        );
    }

    return workbook;
}
