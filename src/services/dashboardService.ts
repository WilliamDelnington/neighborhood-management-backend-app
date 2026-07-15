import {
    Household,
    Citizen,
    Complaint,
    PcccCheck,
    SecurityRecord,
    Meeting,
    Survey,
    SurveyResponse,
    FinanceTransaction,
    type IUser,
} from "@/models";
import { clusterScopeFilter } from "@/lib/rbac";

export type DashboardTask = { label: string; count: number; link: string };

/**
 * To truong chi duoc xem so lieu dan cu/ho dan trong pham vi cum duoc phan cong
 * (assignedClusters); admin/canh sat khu vuc/can bo UBND van xem tong so toan
 * to dan pho nhu cu.
 */
async function residentScopeFor(
    actorUser: IUser,
): Promise<{ householdFilter: Record<string, unknown>; scoped: boolean }> {
    const isLeaderOnly =
        !actorUser.roles.includes("admin") &&
        actorUser.roles.includes("neighborhood_leader");
    if (!isLeaderOnly) return { householdFilter: {}, scoped: false };

    const scope = clusterScopeFilter(actorUser);
    if (Object.keys(scope).length === 0) return { householdFilter: {}, scoped: false };

    return { householdFilter: scope, scoped: true };
}

/**
 * Tong hop toan bo so lieu cho dashboard admin/can bo: dan cu, phan anh, PCCC,
 * cuoc hop sap toi, tai chinh, khao sat, va danh sach viec can xu ly theo vai tro.
 * Cac so lieu gan voi ho dan (so ho, nhan khau, PCCC, an ninh) duoc loc theo
 * cum dan cu duoc phan cong (clusterScopeFilter) - to truong chi thay so lieu
 * trong pham vi cum cua minh, giong nhu danh sach ho dan/nhan khau. Cuoc hop,
 * tai chinh, khao sat van la du lieu chung toan to nen khong loc theo cum.
 */
export async function getDashboardSummary(actorUser: IUser) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const householdScope = clusterScopeFilter(actorUser);
    const isClusterScoped = Object.keys(householdScope).length > 0;
    const scopedHouseholdIds = isClusterScoped
        ? (await Household.find(householdScope).select("_id")).map(h => h._id)
        : undefined;

    const householdFilter: Record<string, unknown> = isClusterScoped
        ? { _id: { $in: scopedHouseholdIds } }
        : {};
    const citizenFilter: Record<string, unknown> = isClusterScoped
        ? { householdId: { $in: scopedHouseholdIds } }
        : {};

    const [
        totalHouseholds,
        totalCitizens,
        rentalHouseholds,
        householdsNeedingSupport,
        newComplaints,
        inProgressComplaints,
        highRiskPcccAgg,
        upcomingMeetingsRaw,
        monthIncomeAgg,
        monthExpenseAgg,
        allTimeIncomeAgg,
        allTimeExpenseAgg,
        openSurveys,
        openSurveyDocs,
        urgentSecurityCount,
    ] = await Promise.all([
        Household.countDocuments(householdFilter),
        Citizen.countDocuments(citizenFilter),
        Household.countDocuments({ ...householdFilter, ownershipType: "cho_thue" }),
        Household.countDocuments({ ...householdFilter, needsSupport: true }),
        Complaint.countDocuments({ status: "moi_tiep_nhan" }),
        Complaint.countDocuments({ status: "dang_xu_ly" }),
        PcccCheck.aggregate([
            ...(isClusterScoped
                ? [{ $match: { householdId: { $in: scopedHouseholdIds } } }]
                : []),
            { $sort: { inspectionDate: -1 } },
            {
                $group: {
                    _id: "$householdId",
                    riskLevel: { $first: "$riskLevel" },
                },
            },
            { $match: { riskLevel: "do" } },
            { $count: "total" },
        ]) as Promise<any[]>,
        Meeting.find({ startTime: { $gte: now } })
            .sort({ startTime: 1 })
            .limit(5),
        FinanceTransaction.aggregate([
            { $match: { type: "thu", transactionDate: { $gte: monthStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]) as Promise<any[]>,
        FinanceTransaction.aggregate([
            { $match: { type: "chi", transactionDate: { $gte: monthStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]) as Promise<any[]>,
        FinanceTransaction.aggregate([
            { $match: { type: "thu" } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]) as Promise<any[]>,
        FinanceTransaction.aggregate([
            { $match: { type: "chi" } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]) as Promise<any[]>,
        Survey.countDocuments({ status: "dang_mo" }),
        Survey.find({ status: "dang_mo" }).select("_id"),
        SecurityRecord.countDocuments({
            level: "khan_cap",
            ...(isClusterScoped
                ? { householdId: { $in: scopedHouseholdIds } }
                : {}),
        }),
    ]);

    const openSurveyIds = openSurveyDocs.map(s => s._id);
    const totalResponses = openSurveyIds.length
        ? await SurveyResponse.countDocuments({
              surveyId: { $in: openSurveyIds },
          })
        : 0;

    const highRiskPcccCount = highRiskPcccAgg[0]?.total || 0;
    const monthIncome = monthIncomeAgg[0]?.total || 0;
    const monthExpense = monthExpenseAgg[0]?.total || 0;
    const allTimeIncome = allTimeIncomeAgg[0]?.total || 0;
    const allTimeExpense = allTimeExpenseAgg[0]?.total || 0;

    const taskList = await buildTaskList(actorUser, {
        newComplaints,
        inProgressComplaints,
        highRiskPcccCount,
        urgentSecurityCount,
    });

    return {
        totalHouseholds,
        totalCitizens,
        rentalHouseholds,
        householdsNeedingSupport,
        scopedToCluster,
        newComplaints,
        inProgressComplaints,
        highRiskPcccCount,
        upcomingMeetings: upcomingMeetingsRaw.map(m => ({
            id: m._id,
            title: m.title,
            startTime: m.startTime,
            location: m.location,
        })),
        financeSummary: {
            monthIncome,
            monthExpense,
            monthNet: monthIncome - monthExpense,
            allTimeNet: allTimeIncome - allTimeExpense,
        },
        surveyParticipation: {
            openSurveys,
            totalResponses,
        },
        taskList,
    };
}

/**
 * Danh sach "viec can xu ly" duoc tuy bien theo vai tro cua nguoi dang xem dashboard.
 * Luu y: Complaint hien khong co truong "cluster" rieng (chi co "area" dang text tu do),
 * nen chua the loc phan anh theo dung cum dan cu duoc phan cong cho to truong;
 * o day tam thoi hien thi tong so phan anh dang cho xu ly tren toan to dan pho.
 */
async function buildTaskList(
    actorUser: IUser,
    ctx: {
        newComplaints: number;
        inProgressComplaints: number;
        highRiskPcccCount: number;
        urgentSecurityCount: number;
    },
): Promise<DashboardTask[]> {
    const roles = actorUser.roles || [];
    const tasks: DashboardTask[] = [];

    const isAdmin = roles.includes("admin");
    const isLeader = roles.includes("neighborhood_leader");
    const isPolice = roles.includes("regional_police");

    if (isAdmin || isLeader) {
        const pendingComplaints = await Complaint.countDocuments({
            status: { $in: ["moi_tiep_nhan", "da_tiep_nhan"] },
        });
        if (pendingComplaints > 0) {
            tasks.push({
                label: "Phản ánh cần tiếp nhận / xử lý",
                count: pendingComplaints,
                link: "/admin/complaints",
            });
        }
        if (ctx.highRiskPcccCount > 0) {
            tasks.push({
                label: "Hộ có nguy cơ PCCC mức Đỏ cần kiểm tra lại",
                count: ctx.highRiskPcccCount,
                link: "/admin/pccc?riskLevel=do",
            });
        }
    }

    if (isAdmin || isPolice) {
        if (ctx.urgentSecurityCount > 0) {
            tasks.push({
                label: "Hồ sơ an ninh mức Khẩn cấp cần xử lý",
                count: ctx.urgentSecurityCount,
                link: "/admin/security?level=khan_cap",
            });
        }
    }

    if (isAdmin) {
        if (ctx.newComplaints > 0) {
            tasks.push({
                label: "Phản ánh mới tiếp nhận",
                count: ctx.newComplaints,
                link: "/admin/complaints?status=moi_tiep_nhan",
            });
        }
        if (ctx.inProgressComplaints > 0) {
            tasks.push({
                label: "Phản ánh đang xử lý",
                count: ctx.inProgressComplaints,
                link: "/admin/complaints?status=dang_xu_ly",
            });
        }
    }

    return tasks;
}
