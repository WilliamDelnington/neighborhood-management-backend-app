import {
    Household,
    HouseRecord,
    Citizen,
    Complaint,
    PcccCheck,
    SecurityRecord,
    Meeting,
    MeetingRegistration,
    Survey,
    SurveyResponse,
    SupportTicket,
    InspectionCampaign,
    InspectionTarget,
    Neighborhood,
    type IUser,
} from "@/models";
import {
    getUserAllowedComplaintCategories,
    getUserPermissionSet,
} from "@/lib/rbac";
import {
    TRANG_THAI_PHAN_ANH_LABEL,
    type TrangThaiPhanAnh,
} from "@/types";
import {
    getMyRequestCounts,
    listMyPendingRequestsForDashboard,
} from "@/services/requestService";
import { getMyAssignedComplaintCounts } from "@/services/complaintService";
import { getHouseIdsForActingOwner } from "@/services/houseOwnershipService";
import { getUnreadCount } from "@/services/notificationReadService";
import { getFinanceReport, getRequestReport } from "@/services/reportService";

const COMPLAINT_TERMINAL_STATUSES = ["hoan_thanh", "dong"];
const SUPPORT_TICKET_TERMINAL_STATUSES = ["dong"];

export type DashboardTask = { label: string; count: number; link: string };

export type DashboardAudience =
    | "system_admin"
    | "ward"
    | "neighborhood"
    | "police"
    | "staff";

type DashboardAreaContext = {
    audience: DashboardAudience;
    scopeLabel: string;
    areaFilter: Record<string, unknown>;
    complaintFilter: Record<string, unknown>;
    neighborhoodIds: unknown[];
    scoped: boolean;
};

const NO_SCOPE_FILTER = { _id: { $in: [] } };

/** Xac dinh audience va pham vi du lieu cho dashboard, khong chi cho menu. */
async function dashboardAreaContext(actorUser: IUser): Promise<DashboardAreaContext> {
    const roles = actorUser.roles || [];
    if (roles.includes("admin")) {
        return {
            audience: "system_admin",
            scopeLabel: "Toàn hệ thống",
            areaFilter: {},
            complaintFilter: {},
            neighborhoodIds: [],
            scoped: false,
        };
    }

    const isNeighborhood =
        roles.includes("neighborhood_leader") ||
        roles.includes("neighborhood_coleader");
    const isWard =
        roles.includes("secretary") ||
        roles.includes("people_committee_official");
    const audience: DashboardAudience = isNeighborhood
        ? "neighborhood"
        : isWard
          ? "ward"
          : roles.includes("regional_police")
            ? "police"
            : "staff";

    if (isNeighborhood) {
        const neighborhoodIds = [
            actorUser.neighborhoodId,
            ...(actorUser.assignedNeighborhoodIds || []),
        ].filter(Boolean);
        if (neighborhoodIds.length === 0) {
            return {
                audience,
                scopeLabel: "Chưa được phân công Tổ dân phố",
                areaFilter: NO_SCOPE_FILTER,
                complaintFilter: NO_SCOPE_FILTER,
                neighborhoodIds,
                scoped: true,
            };
        }
        const neighborhoods = await Neighborhood.find({
            _id: { $in: neighborhoodIds },
        }).select("name");
        return {
            audience,
            scopeLabel:
                neighborhoods.length === 1
                    ? neighborhoods[0].name
                    : `${neighborhoods.length} Tổ dân phố được phân công`,
            areaFilter: { neighborhoodId: { $in: neighborhoodIds } },
            complaintFilter: { neighborhoodId: { $in: neighborhoodIds } },
            neighborhoodIds,
            scoped: true,
        };
    }

    // Bi thu/can bo UBND phai bi gioi han theo Phuong. Cac vai tro khac co
    // wardCode va khong co cum cung dung scope nay (vd cong an duoc gan Phuong).
    if ((isWard || !actorUser.assignedClusters?.length) && actorUser.wardCode) {
        const neighborhoodIds = await Neighborhood.distinct("_id", {
            wardCode: actorUser.wardCode,
        });
        return {
            audience,
            scopeLabel: actorUser.wardName || `Phường/xã ${actorUser.wardCode}`,
            areaFilter:
                neighborhoodIds.length > 0
                    ? { neighborhoodId: { $in: neighborhoodIds } }
                    : NO_SCOPE_FILTER,
            complaintFilter: { wardCode: actorUser.wardCode },
            neighborhoodIds,
            scoped: true,
        };
    }

    if (actorUser.assignedClusters?.length) {
        return {
            audience,
            scopeLabel:
                actorUser.assignedClusters.length === 1
                    ? actorUser.assignedClusters[0]
                    : `${actorUser.assignedClusters.length} khu vực được phân công`,
            areaFilter: { cluster: { $in: actorUser.assignedClusters } },
            complaintFilter: { cluster: { $in: actorUser.assignedClusters } },
            neighborhoodIds: [],
            scoped: true,
        };
    }

    return {
        audience,
        scopeLabel: "Chưa được phân công khu vực",
        areaFilter: NO_SCOPE_FILTER,
        complaintFilter: NO_SCOPE_FILTER,
        neighborhoodIds: [],
        scoped: true,
    };
}

export type HouseGisOverview = {
    scopeLabel: string;
    totalHouses: number;
    housesWithCoordinates: number;
    points: Array<{
        houseId: string;
        code: string;
        address: string;
        latitude: number;
        longitude: number;
        accuracyMeters: number | null;
    }>;
};

/**
 * Ban do tong hop cho nhan vien (secretary/to truong/pho/can bo UBND) - dung
 * chung logic pham vi voi getDashboardSummary (dashboardAreaContext) nhung
 * chi doc dung cac truong can cho ban do, KHONG keo theo cac truong lam giau
 * (citizenCount/PCCC/an ninh) ma getDashboardSummary.gisOverview dang co, vi
 * endpoint nay duoc goi rieng le luc bam nut "Xem ban do" (xem
 * app/api/houses/gis-overview/route.ts) - can giu truy van gon nhe.
 */
export async function getHouseGisOverview(
    actorUser: IUser,
): Promise<HouseGisOverview> {
    const context = await dashboardAreaContext(actorUser);
    const houses = await HouseRecord.find(context.areaFilter).select(
        "_id code address gisLatitude gisLongitude gisAccuracyMeters",
    );
    const points = houses
        .filter(
            house =>
                house.gisLatitude &&
                house.gisLongitude &&
                Number.isFinite(house.gisLatitude) &&
                Number.isFinite(house.gisLongitude),
        )
        .map(house => ({
            houseId: String(house._id),
            code: house.code,
            address: house.address,
            latitude: Number(house.gisLatitude),
            longitude: Number(house.gisLongitude),
            accuracyMeters: house.gisAccuracyMeters ?? null,
        }));
    return {
        scopeLabel: context.scopeLabel,
        totalHouses: houses.length,
        housesWithCoordinates: points.length,
        points,
    };
}

/**
 * Dashboard dieu hanh co hai lop bao ve: permission quyet dinh nhom so lieu
 * nao duoc tinh; Phuong/To/cum duoc gan quyet dinh ban ghi nao duoc tinh.
 * API khong truy van so lieu nhay cam neu user chi co dashboard.read.
 */
export async function getDashboardSummary(actorUser: IUser) {
    const now = new Date();
    const [permissions, context] = await Promise.all([
        getUserPermissionSet(actorUser),
        dashboardAreaContext(actorUser),
    ]);

    const capabilities = {
        population:
            permissions.has("houses.read") ||
            permissions.has("households.read") ||
            permissions.has("citizens.read"),
        complaints: permissions.has("complaints.read"),
        pccc: permissions.has("pccc.read"),
        security: permissions.has("security.read"),
        requests: permissions.has("requests.read"),
        inspections: permissions.has("inspections.read"),
        finance: permissions.has("finance.read"),
        surveys: permissions.has("surveys.read"),
        meetings: permissions.has("meetings.read"),
    };

    const [households, houses, myRequests, myRequestCounts, myComplaintCounts] =
        await Promise.all([
            capabilities.population
                ? Household.find(context.areaFilter).select(
                      "_id houseId cluster neighborhoodId ownershipType needsSupport",
                  )
                : Promise.resolve([]),
            capabilities.population || capabilities.pccc || capabilities.security
                ? HouseRecord.find(context.areaFilter).select(
                      "_id code address cluster neighborhoodId gisLatitude gisLongitude gisAccuracyMeters gisSource",
                  )
                : Promise.resolve([]),
            listMyPendingRequestsForDashboard(String(actorUser._id)),
            getMyRequestCounts(String(actorUser._id)),
            getMyAssignedComplaintCounts(String(actorUser._id)),
        ]);

    const householdIds = households.map(household => household._id);
    const houseIds = houses.map(house => house._id);
    const neighborhoodIds = [
        ...new Set(
            [...households, ...houses]
                .map(row => row.neighborhoodId && String(row.neighborhoodId))
                .filter((value): value is string => Boolean(value)),
        ),
    ];

    const [
        neighborhoods,
        citizensByHousehold,
        complaintRows,
        openComplaintsByHouse,
        latestPccc,
        latestSecurity,
    ] =
        await Promise.all([
            neighborhoodIds.length > 0
                ? Neighborhood.find({ _id: { $in: neighborhoodIds } }).select(
                      "name",
                  )
                : Promise.resolve([]),
            capabilities.population && householdIds.length > 0
                ? Citizen.aggregate([
                      { $match: { householdId: { $in: householdIds } } },
                      { $group: { _id: "$householdId", count: { $sum: 1 } } },
                  ])
                : Promise.resolve([]),
            capabilities.complaints
                ? getComplaintDashboardRows(actorUser, context.complaintFilter)
                : Promise.resolve([]),
            capabilities.complaints && houseIds.length > 0
                ? Complaint.aggregate([
                      {
                          $match: {
                              ...context.complaintFilter,
                              houseId: { $in: houseIds },
                              status: { $nin: COMPLAINT_TERMINAL_STATUSES },
                          },
                      },
                      { $group: { _id: "$houseId", count: { $sum: 1 } } },
                  ])
                : Promise.resolve([]),
            capabilities.pccc && houseIds.length > 0
                ? PcccCheck.aggregate([
                      { $match: { houseId: { $in: houseIds } } },
                      { $sort: { houseId: 1, inspectionDate: -1, createdAt: -1 } },
                      {
                          $group: {
                              _id: "$houseId",
                              riskLevel: { $first: "$riskLevel" },
                          },
                      },
                  ])
                : Promise.resolve([]),
            capabilities.security && houseIds.length > 0
                ? SecurityRecord.aggregate([
                      { $match: { houseId: { $in: houseIds } } },
                      { $sort: { houseId: 1, inspectionDate: -1, createdAt: -1 } },
                      {
                          $group: {
                              _id: "$houseId",
                              level: { $first: "$level" },
                          },
                      },
                  ])
                : Promise.resolve([]),
        ]);

    const neighborhoodNameById = new Map(
        neighborhoods.map(neighborhood => [
            String(neighborhood._id),
            neighborhood.name,
        ]),
    );
    const citizenCountByHousehold = new Map(
        citizensByHousehold.map(row => [String(row._id), Number(row.count)]),
    );
    const houseById = new Map(houses.map(house => [String(house._id), house]));
    const citizenCountByHouse = new Map<string, number>();
    for (const household of households) {
        if (!household.houseId) continue;
        const houseId = String(household.houseId);
        citizenCountByHouse.set(
            houseId,
            (citizenCountByHouse.get(houseId) || 0) +
                (citizenCountByHousehold.get(String(household._id)) || 0),
        );
    }
    const complaintCountByHouse = new Map(
        openComplaintsByHouse.map(row => [String(row._id), Number(row.count)]),
    );
    const pcccRiskByHouse = new Map(
        latestPccc.map(row => [String(row._id), String(row.riskLevel)]),
    );
    const securityLevelByHouse = new Map(
        latestSecurity.map(row => [String(row._id), String(row.level)]),
    );
    const areaKey = (row: { neighborhoodId?: unknown; cluster?: string }) =>
        row.neighborhoodId
            ? `neighborhood:${String(row.neighborhoodId)}`
            : `cluster:${row.cluster || "unassigned"}`;
    const areaLabel = (row: { neighborhoodId?: unknown; cluster?: string }) =>
        row.neighborhoodId
            ? neighborhoodNameById.get(String(row.neighborhoodId)) || "Tổ dân phố"
            : row.cluster || "Chưa phân khu";

    const populationMap = new Map<
        string,
        { label: string; households: number; citizens: number }
    >();
    for (const household of households) {
        const key = areaKey(household);
        const entry = populationMap.get(key) || {
            label: areaLabel(household),
            households: 0,
            citizens: 0,
        };
        entry.households += 1;
        entry.citizens += citizenCountByHousehold.get(String(household._id)) || 0;
        populationMap.set(key, entry);
    }

    const riskMap = new Map<
        string,
        {
            label: string;
            highRiskPccc: number;
            urgentSecurity: number;
            needsSupport: number;
        }
    >();
    const riskEntryFor = (row: { neighborhoodId?: unknown; cluster?: string }) => {
        const key = areaKey(row);
        const entry = riskMap.get(key) || {
            label: areaLabel(row),
            highRiskPccc: 0,
            urgentSecurity: 0,
            needsSupport: 0,
        };
        riskMap.set(key, entry);
        return entry;
    };
    for (const household of households) {
        if (household.needsSupport) riskEntryFor(household).needsSupport += 1;
    }
    for (const check of latestPccc) {
        if (check.riskLevel !== "do") continue;
        const house = houseById.get(String(check._id));
        if (house) riskEntryFor(house).highRiskPccc += 1;
    }
    for (const record of latestSecurity) {
        if (record.level !== "khan_cap") continue;
        const house = houseById.get(String(record._id));
        if (house) riskEntryFor(house).urgentSecurity += 1;
    }

    const [upcomingMeetingsRaw, openSurveyDocs, requestReport, financeReports, inspection] =
        await Promise.all([
            capabilities.meetings
                ? Meeting.find({ startTime: { $gte: now } })
                      .sort({ startTime: 1 })
                      .limit(5)
                : Promise.resolve([]),
            capabilities.surveys
                ? Survey.find({ status: "dang_mo" }).select("_id")
                : Promise.resolve([]),
            capabilities.requests
                ? getRequestReport(actorUser)
                : Promise.resolve(undefined),
            capabilities.finance
                ? Promise.all([
                      getFinanceReport({}),
                      getFinanceReport({
                          fromDate: new Date(
                              now.getFullYear(),
                              now.getMonth() - 5,
                              1,
                          ),
                      }),
                  ])
                : Promise.resolve(undefined),
            capabilities.inspections
                ? getInspectionDashboard(actorUser, context, houseIds, now)
                : Promise.resolve({
                      activeCampaigns: 0,
                      overdueTargets: 0,
                      progress: [],
                  }),
        ]);

    const totalResponses = openSurveyDocs.length
        ? await SurveyResponse.countDocuments({
              surveyId: { $in: openSurveyDocs.map(survey => survey._id) },
          })
        : 0;
    const complaintCount = new Map(
        complaintRows.map(row => [row.status, row.count]),
    );
    const newComplaints = complaintCount.get("moi_tiep_nhan") || 0;
    const inProgressComplaints = complaintCount.get("dang_xu_ly") || 0;
    const highRiskPcccCount = latestPccc.filter(row => row.riskLevel === "do").length;
    const urgentSecurityCount = latestSecurity.filter(
        row => row.level === "khan_cap",
    ).length;

    const [allTimeFinance, recentFinance] = financeReports || [];
    const currentFinance = recentFinance?.byMonth.find(
        row => row.year === now.getFullYear() && row.month === now.getMonth() + 1,
    );
    const financeByMonth = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
        const row = recentFinance?.byMonth.find(
            item =>
                item.year === date.getFullYear() &&
                item.month === date.getMonth() + 1,
        );
        return {
            label: `T${date.getMonth() + 1}/${date.getFullYear()}`,
            income: row?.income || 0,
            expense: row?.expense || 0,
        };
    });
    const populationByArea = [...populationMap.values()]
        .sort((a, b) => b.households - a.households)
        .slice(0, 10);
    const riskByArea = [...riskMap.values()]
        .filter(
            row =>
                row.highRiskPccc + row.urgentSecurity + row.needsSupport > 0,
        )
        .sort(
            (a, b) =>
                b.highRiskPccc + b.urgentSecurity + b.needsSupport -
                (a.highRiskPccc + a.urgentSecurity + a.needsSupport),
        )
        .slice(0, 10);
    const overdueRequests = requestReport?.overdueAssignments || 0;
    const gisPoints = houses
        .filter(
            house =>
                house.gisLatitude &&
                house.gisLongitude &&
                Number.isFinite(house.gisLatitude) &&
                Number.isFinite(house.gisLongitude),
        )
        .map(house => ({
            houseId: String(house._id),
            code: house.code,
            address: house.address,
            latitude: Number(house.gisLatitude),
            longitude: Number(house.gisLongitude),
            accuracyMeters: house.gisAccuracyMeters,
            citizenCount: citizenCountByHouse.get(String(house._id)) || 0,
            openComplaintCount:
                complaintCountByHouse.get(String(house._id)) || 0,
            highRiskPccc: pcccRiskByHouse.get(String(house._id)) === "do",
            urgentSecurity:
                securityLevelByHouse.get(String(house._id)) === "khan_cap",
        }));
    const taskList = buildDashboardTaskList({
        capabilities,
        newComplaints,
        highRiskPcccCount,
        urgentSecurityCount,
        overdueRequests,
        overdueInspectionTargets: inspection.overdueTargets,
    });

    return {
        audience: context.audience,
        scopeLabel: context.scopeLabel,
        generatedAt: now,
        capabilities,
        totalHouseholds: households.length,
        totalHouses: houses.length,
        totalCitizens: [...citizenCountByHousehold.values()].reduce(
            (sum, count) => sum + count,
            0,
        ),
        rentalHouseholds: households.filter(
            household => household.ownershipType === "cho_thue",
        ).length,
        householdsNeedingSupport: households.filter(
            household => household.needsSupport,
        ).length,
        scopedToCluster: context.scoped,
        newComplaints,
        inProgressComplaints,
        highRiskPcccCount,
        upcomingMeetings: upcomingMeetingsRaw.map(meeting => ({
            id: meeting._id,
            title: meeting.title,
            startTime: meeting.startTime,
            location: meeting.location,
        })),
        financeSummary: {
            monthIncome: currentFinance?.income || 0,
            monthExpense: currentFinance?.expense || 0,
            monthNet:
                (currentFinance?.income || 0) - (currentFinance?.expense || 0),
            allTimeNet: allTimeFinance?.net || 0,
        },
        surveyParticipation: {
            openSurveys: openSurveyDocs.length,
            totalResponses,
        },
        attention: {
            newComplaints,
            overdueRequests,
            highRiskPccc: highRiskPcccCount,
            urgentSecurity: urgentSecurityCount,
            activeInspectionCampaigns: inspection.activeCampaigns,
            overdueInspectionTargets: inspection.overdueTargets,
        },
        charts: {
            populationByArea,
            complaintStatus: complaintRows
                .map(row => ({
                    status: row.status,
                    label:
                        TRANG_THAI_PHAN_ANH_LABEL[
                            row.status as TrangThaiPhanAnh
                        ] || row.status,
                    count: row.count,
                }))
                .sort(
                    (a, b) =>
                        Object.keys(TRANG_THAI_PHAN_ANH_LABEL).indexOf(a.status) -
                        Object.keys(TRANG_THAI_PHAN_ANH_LABEL).indexOf(b.status),
                ),
            requestStatus: requestReport?.byStatus || [],
            inspectionProgress: inspection.progress,
            riskByArea,
            financeByMonth,
        },
        gisOverview: {
            provider: "internal_coordinates",
            totalHouses: houses.length,
            housesWithCoordinates: gisPoints.length,
            points: gisPoints,
        },
        taskList,
        myRequests,
        myRequestCounts,
        myComplaintCounts,
    };
}

async function getComplaintDashboardRows(
    actorUser: IUser,
    scopeFilter: Record<string, unknown>,
): Promise<Array<{ status: string; count: number }>> {
    const allowedCategories = await getUserAllowedComplaintCategories(actorUser);
    const match = {
        ...scopeFilter,
        ...(allowedCategories ? { category: { $in: allowedCategories } } : {}),
    };
    const rows = await Complaint.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    return rows.map(row => ({
        status: String(row._id),
        count: Number(row.count),
    }));
}

async function getInspectionDashboard(
    actorUser: IUser,
    context: DashboardAreaContext,
    houseIds: unknown[],
    now: Date,
) {
    const targetScope: Record<string, unknown> = !context.scoped
        ? {}
        : context.neighborhoodIds.length > 0
          ? { neighborhoodId: { $in: context.neighborhoodIds } }
          : { houseId: { $in: houseIds } };
    const visibleCampaignIds = context.scoped
        ? await InspectionTarget.distinct("campaignId", targetScope)
        : [];
    let campaignFilter: Record<string, unknown> = {
        status: { $in: ["ACTIVE", "LOCKED"] },
    };
    if (context.scoped) {
        if (context.audience === "ward" && actorUser.wardCode) {
            campaignFilter = {
                ...campaignFilter,
                $or: [
                    { wardCode: actorUser.wardCode },
                    { _id: { $in: visibleCampaignIds } },
                ],
            };
        } else {
            campaignFilter = {
                ...campaignFilter,
                _id: { $in: visibleCampaignIds },
            };
        }
    }

    const allCampaigns = await InspectionCampaign.find(campaignFilter)
        .sort({ dueAt: 1 })
        .select("name dueAt");
    const campaignIds = allCampaigns.map(campaign => campaign._id);
    const targets = campaignIds.length
        ? await InspectionTarget.find({
              campaignId: { $in: campaignIds },
              ...targetScope,
          }).select("campaignId resultStatus")
        : [];
    const targetRowsByCampaign = new Map<string, typeof targets>();
    for (const target of targets) {
        const key = String(target.campaignId);
        const rows = targetRowsByCampaign.get(key) || [];
        rows.push(target);
        targetRowsByCampaign.set(key, rows);
    }

    const overdueTargets = allCampaigns.reduce((total, campaign) => {
        if (campaign.dueAt >= now) return total;
        const rows = targetRowsByCampaign.get(String(campaign._id)) || [];
        return (
            total +
            rows.filter(target => target.resultStatus !== "VERIFIED").length
        );
    }, 0);
    const progress = allCampaigns.slice(0, 6).map(campaign => {
        const rows = targetRowsByCampaign.get(String(campaign._id)) || [];
        return {
            campaignId: String(campaign._id),
            label: campaign.name,
            verified: rows.filter(target => target.resultStatus === "VERIFIED")
                .length,
            submitted: rows.filter(target => target.resultStatus === "SUBMITTED")
                .length,
            requiresAction: rows.filter(target =>
                ["REQUEST_REVISION", "FIELD_CHECK_REQUIRED"].includes(
                    target.resultStatus,
                ),
            ).length,
            pending: rows.filter(target =>
                ["PENDING", "DRAFT"].includes(target.resultStatus),
            ).length,
        };
    });
    return {
        activeCampaigns: allCampaigns.length,
        overdueTargets,
        progress,
    };
}

function buildDashboardTaskList(ctx: {
    capabilities: {
        complaints: boolean;
        pccc: boolean;
        security: boolean;
        requests: boolean;
        inspections: boolean;
    };
    newComplaints: number;
    highRiskPcccCount: number;
    urgentSecurityCount: number;
    overdueRequests: number;
    overdueInspectionTargets: number;
}): DashboardTask[] {
    const tasks: DashboardTask[] = [];
    if (ctx.capabilities.complaints && ctx.newComplaints > 0) {
        tasks.push({
            label: "Phản ánh mới cần tiếp nhận",
            count: ctx.newComplaints,
            link: "/admin/complaints?status=moi_tiep_nhan",
        });
    }
    if (ctx.capabilities.requests && ctx.overdueRequests > 0) {
        tasks.push({
            label: "Yêu cầu công việc quá hạn",
            count: ctx.overdueRequests,
            link: "/admin/requests",
        });
    }
    if (ctx.capabilities.inspections && ctx.overdueInspectionTargets > 0) {
        tasks.push({
            label: "Nhà quá hạn rà soát",
            count: ctx.overdueInspectionTargets,
            link: "/admin/inspections",
        });
    }
    if (ctx.capabilities.pccc && ctx.highRiskPcccCount > 0) {
        tasks.push({
            label: "Nhà có nguy cơ PCCC mức Đỏ",
            count: ctx.highRiskPcccCount,
            link: "/admin/pccc?riskLevel=do",
        });
    }
    if (ctx.capabilities.security && ctx.urgentSecurityCount > 0) {
        tasks.push({
            label: "Hồ sơ an ninh mức Khẩn cấp",
            count: ctx.urgentSecurityCount,
            link: "/admin/security?level=khan_cap",
        });
    }
    return tasks;
}

/** Dashboard rieng cho tai khoan Nha so, chi tinh du lieu cua chinh user. */
export async function getMyHouseDashboard(actorUser: IUser) {
    const userId = String(actorUser._id);

    const [
        unread,
        myRequestCounts,
        activeComplaints,
        openSupportTickets,
        houseIds,
        openSurveyDocs,
        respondedSurveyIds,
        upcomingMeetingDocs,
        myMeetingRegistrations,
    ] = await Promise.all([
        getUnreadCount(userId),
        getMyRequestCounts(userId),
        Complaint.countDocuments({
            createdByUserId: userId,
            status: { $nin: COMPLAINT_TERMINAL_STATUSES },
        }),
        SupportTicket.countDocuments({
            createdByUserId: userId,
            status: { $nin: SUPPORT_TICKET_TERMINAL_STATUSES },
        }),
        getHouseIdsForActingOwner(userId),
        Survey.find({ status: "dang_mo" }).select("_id"),
        SurveyResponse.find({ userId }).select("surveyId"),
        Meeting.find({ startTime: { $gte: new Date() }, published: true })
            .sort({ startTime: 1 })
            .select("_id title startTime location"),
        MeetingRegistration.find({ userId }).select("meetingId"),
    ]);

    const respondedSurveyIdSet = new Set(
        respondedSurveyIds.map(response => String(response.surveyId)),
    );
    const pendingSurveys = openSurveyDocs.filter(
        survey => !respondedSurveyIdSet.has(String(survey._id)),
    ).length;
    const registeredMeetingIdSet = new Set(
        myMeetingRegistrations.map(registration =>
            String(registration.meetingId),
        ),
    );
    const pendingMeetings = upcomingMeetingDocs.filter(
        meeting => !registeredMeetingIdSet.has(String(meeting._id)),
    );

    return {
        unreadNotifications: unread.count,
        myRequestCounts,
        activeComplaints,
        openSupportTickets,
        pendingSurveys,
        upcomingMeetings: pendingMeetings.slice(0, 5).map(meeting => ({
            id: meeting._id,
            title: meeting.title,
            startTime: meeting.startTime,
            location: meeting.location,
        })),
        hasLinkedHouse: houseIds.length > 0,
    };
}
