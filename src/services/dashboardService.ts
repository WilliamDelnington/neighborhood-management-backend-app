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
    Business,
    Company,
    BusinessDocument,
    BusinessType,
    ResidentRecord,
    HouseOwnership,
    type IUser,
} from "@/models";
import {
    getUserAllowedComplaintCategories,
    getUserPermissionSet,
} from "@/lib/rbac";
import {
    TRANG_THAI_PHAN_ANH_LABEL,
    type TrangThaiPhanAnh,
    type HouseRecordStatus,
} from "@/types";
import {
    getMyRequestCounts,
    listMyPendingRequestsForDashboard,
} from "@/services/requestService";
import { getMyAssignedComplaintCounts } from "@/services/complaintService";
import { getHouseIdsForActingOwner } from "@/services/houseOwnershipService";
import { getUnreadCount } from "@/services/notificationReadService";
import {
    getFinanceReport,
    getRequestReport,
    type RequestReport,
} from "@/services/reportService";

const COMPLAINT_TERMINAL_STATUSES = ["hoan_thanh", "dong"];
const SUPPORT_TICKET_TERMINAL_STATUSES = ["dong"];
// Do tuoi nhap ngu ap dung nam gioi (Luat NVQS) - cung khoang tuoi da dung o
// admin-web-app ExportReports/reportItems.ts (client-side), lam lai server-side
// o day de tinh duoc so lieu tong hop cho dashboard.
const MILITARY_AGE_MIN = 18;
const MILITARY_AGE_MAX = 25;
// Do tuoi di hoc (tieu hoc den THPT) - khai niem MOI, chua tung dinh nghia o
// dau khac trong he thong (xem thao luan luc thiet ke tinh nang dashboard).
const SCHOOL_AGE_MIN = 6;
const SCHOOL_AGE_MAX = 18;

/**
 * Tra ve khoang birthDate (tu ngay - den ngay) ung voi mot khoang tuoi [min,max]
 * tinh tai thoi diem `now`. Dung cho cac chi so tinh theo tuoi (nam trong do
 * tuoi nhap ngu, tre trong do tuoi di hoc) thay vi mot co thu cong rieng -
 * tuoi luon dung voi ngay sinh thuc te, khong the "quen cap nhat" nhu mot co
 * boolean.
 */
function birthDateRangeForAge(
    min: number,
    max: number,
    now: Date,
): { from: Date; to: Date } {
    // "to" = ngay sinh MOI NHAT de vua tron `min` tuoi (sinh vao dung ngay nay
    // thi hom nay vua tron min tuoi).
    const to = new Date(now);
    to.setFullYear(to.getFullYear() - min);
    // "from" = ngay sinh SOM NHAT de chua qua (max+1) tuoi (sinh sau ngay nay
    // 1 ngay thi hom nay chua tron max+1 tuoi).
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - (max + 1));
    from.setDate(from.getDate() + 1);
    return { from, to };
}

/** Gom 6 trang thai TrangThaiPhanAnh ve 4 nhom hien thi tren dashboard. */
function bucketComplaintCounts(
    complaintCount: Map<string, number>,
): ComplaintSummary {
    const get = (status: string) => complaintCount.get(status) || 0;
    const unprocessed = get("moi_tiep_nhan");
    const inProgress = get("dang_xu_ly") + get("can_bo_sung");
    const processed = get("da_xu_ly") + get("hoan_thanh") + get("dong");
    return {
        unprocessed,
        inProgress,
        processed,
        total: unprocessed + inProgress + processed,
    };
}

export type DashboardTask = { label: string; count: number; link: string };

export type DashboardAudience =
    | "system_admin"
    | "ward"
    | "neighborhood"
    | "police"
    | "social_affairs"
    | "health"
    | "education"
    | "economy_labor"
    | "staff";

// Cac audience deu la "ho hang" cap Phuong - dung chung khoi "Nha so"/"Phan
// anh" (buildWardOverview), chi khac o phan "phong ban" rieng (buildDepartmentOverview).
const WARD_FAMILY_AUDIENCES: DashboardAudience[] = [
    "ward",
    "police",
    "social_affairs",
    "health",
    "education",
    "economy_labor",
];

type DashboardAreaContext = {
    audience: DashboardAudience;
    scopeLabel: string;
    areaFilter: Record<string, unknown>;
    complaintFilter: Record<string, unknown>;
    neighborhoodIds: unknown[];
    scoped: boolean;
};

const NO_SCOPE_FILTER = { _id: { $in: [] } };

// Nguong dung de gan co "cham"/"nhieu canh bao" cho tung To trong dashboard
// Phuong - la quy uoc hien thi, khong phai chi tieu chinh thuc duoc duyet.
const WARD_SLOW_VERIFICATION_RATE = 70;
const WARD_HIGH_ALERT_THRESHOLD = 3;
const BUSINESS_LICENSE_EXPIRING_DAYS = 60;

export type NeighborhoodOverview = {
    houses: {
        total: number;
        verified: number;
        unverified: number;
        pending: number;
        needsAttention: number;
        occupied: number;
        business: number;
        vacant: number;
    };
    population: {
        households: number;
        citizens: number;
        permanentResidents: number;
        temporaryResidents: number;
        renters: number;
        elderly: number;
        children: number;
        needsSupport: number;
        // 8 chi so nhan khau/ho dan cho dashboard To truong/To pho (hang 1+2
        // trong yeu cau) - women/veterans/martyrs/militaryAgeMen tu Citizen,
        // poorHouseholds tu Household.isNearPoor, unemployed tu Citizen.isUnemployed.
        women: number;
        veterans: number;
        martyrs: number;
        poorHouseholds: number;
        unemployed: number;
        militaryAgeMen: number;
        // Nhom "Nha so" (Chua khai bao cu tru/Co dich benh theo doi/Nha so da
        // dang ky) - registeredHouses trung voi houses.verified da co san,
        // giu them ten rieng cho ro nghia khi hien thi.
        undeclaredResidency: number;
        diseaseMonitoredHouseholds: number;
        registeredHouses: number;
    };
    business: {
        dataAvailable: boolean;
        total: number;
        totalCompanies: number;
        byIndustry: { label: string; count: number }[];
        missingLicense: number;
        expiringLicenses: number;
        needsReview: number;
    };
    safety: {
        dataAvailable: boolean;
        housesNotInspected: number;
        highRiskPccc: number;
        urgentSecurity: number;
        unresolvedRecommendations: number;
        openComplaints: number;
    };
    tasks: {
        newComplaints: number;
        inProgressComplaints: number;
        overdueRequestAssignments: number;
        resolvedRequestAssignments: number;
        totalRequestAssignments: number;
        onTimeCompletionRate: number | null;
        averageSatisfaction: number | null;
        ratedComplaintCount: number;
    };
    // Nhom "Phan anh" 4-nhom (Chua xu ly/Dang xu ly/Da xu ly/Tong) - xem
    // bucketComplaintCounts(). Doc lap voi tasks.newComplaints/inProgressComplaints
    // o tren (giu nguyen y nghia cu, khong doi de tranh anh huong noi khac dang dung).
    complaintSummary: ComplaintSummary;
};

export type ComplaintSummary = {
    unprocessed: number;
    inProgress: number;
    processed: number;
    total: number;
};

export type WardNeighborhoodRow = {
    neighborhoodId: string;
    name: string;
    totalHouses: number;
    verifiedHouses: number;
    verificationRate: number;
    lastUpdatedAt: string | null;
    isSlow: boolean;
    highAlertCount: number;
    isHighAlert: boolean;
};

export type WardOverview = {
    neighborhoods: WardNeighborhoodRow[];
    // Nhom "Nha so" dung chung cho MOI tai khoan cap Phuong (ward/police/
    // social_affairs/health/education/economy_labor) - xem buildWardOverview.
    // "neighborhoods" o day la SO LUONG (khong kem mau so co dinh - xem quyet
    // dinh thiet ke, khong bia them mot cau hinh "tong so to du kien" moi).
    houseSummary: {
        neighborhoods: number;
        houses: number;
        owners: number;
        businessUnits: number;
    };
    complaintSummary: ComplaintSummary;
    dataQuality: {
        duplicateAddressGroups: number;
        duplicateAddressHouses: number;
        otherChecksAvailable: boolean;
    };
    population: {
        households: number;
        citizens: number;
        renters: number;
        elderly: number;
        childrenApprox: number;
        needsSupport: number;
    };
    economy: {
        dataAvailable: boolean;
        total: number;
        totalCompanies: number;
        byIndustry: { label: string; count: number }[];
        expiringLicenses: number;
        newInPeriod: number;
        inactive: number;
    };
    safety: {
        dataAvailable: boolean;
        highRiskPccc: number;
        urgentSecurity: number;
        housesNotInspected: number;
        byNeighborhood: {
            neighborhoodId: string;
            name: string;
            highRiskPccc: number;
            urgentSecurity: number;
            openComplaints: number;
        }[];
    };
    digitalServicesAvailable: boolean;
    systemSafetyAvailable: boolean;
};

/**
 * Khoi du lieu RIENG cho tung "phong ban" cap Phuong (Cong an/Van hoa-Xa hoi/
 * Y te/Giao duc/Kinh te-Lao dong) - chi field tuong ung voi audience hien tai
 * duoc dien, cac field con lai la undefined. Dung kem voi WardOverview (khoi
 * "Nha so"/"Phan anh" dung chung cho MOI tai khoan cap Phuong) - xem
 * buildDepartmentOverview.
 */
export type DepartmentOverview = {
    police?: {
        undeclaredResidency: number;
        militaryAgeMen: number;
    };
    socialAffairs?: {
        women: number;
        elderly: number;
        children: number;
        veterans: number;
        martyrs: number;
        poorHouseholds: number;
    };
    health?: {
        diseaseMonitoredHouseholds: number;
    };
    education?: {
        schoolAgeChildren: number;
    };
    economyLabor?: {
        businessUnits: number;
        unemployed: number;
    };
};

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
    const isPolice = roles.includes("regional_police");
    // 4 vai tro "phong ban" moi - moi vai tro co audience/khoi du lieu rieng
    // (buildDepartmentOverview), khac voi audience "ward" chung chung truoc
    // day (vd secretary/people_committee_official, hoac bat ky vai tro Phuong
    // tuy chinh nao khac khong nam trong danh sach nay).
    const isSocialAffairs = roles.includes("social_affairs_official");
    const isHealth = roles.includes("health_official");
    const isEducation = roles.includes("education_official");
    const isEconomyLabor = roles.includes("economy_labor_official");
    // Truoc day chi secretary/people_committee_official duoc coi la audience
    // "ward". Cac vai tro Phuong tuy chinh tao qua Role admin (vd
    // social_cultral_leader) duoc gan wardCode giong secretary nhung khong
    // nam trong danh sach co dinh - tong quat hoa: bat ky vai tro nao khong
    // phai To/Cong an/Admin/4 phong ban moi va co wardCode deu duoc coi la
    // dieu hanh cap Phuong, khong phu thuoc ten role key cu the.
    const isWard =
        !isNeighborhood &&
        !isPolice &&
        !isSocialAffairs &&
        !isHealth &&
        !isEducation &&
        !isEconomyLabor &&
        Boolean(actorUser.wardCode);
    const audience: DashboardAudience = isNeighborhood
        ? "neighborhood"
        : isSocialAffairs
          ? "social_affairs"
          : isHealth
            ? "health"
            : isEducation
              ? "education"
              : isEconomyLabor
                ? "economy_labor"
                : isWard
                  ? "ward"
                  : isPolice
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
        business: permissions.has("businesses.read"),
    };

    const [households, houses, myRequests, myRequestCounts, myComplaintCounts] =
        await Promise.all([
            capabilities.population
                ? Household.find(context.areaFilter).select(
                      "_id houseId cluster neighborhoodId ownershipType needsSupport isNearPoor diseaseStatus",
                  )
                : Promise.resolve([]),
            capabilities.population ||
            capabilities.pccc ||
            capabilities.security ||
            capabilities.business
                ? HouseRecord.find(context.areaFilter).select(
                      "_id code address cluster neighborhoodId status gisLatitude gisLongitude gisAccuracyMeters gisSource",
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
                              followUpStatus: { $first: "$followUpStatus" },
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
    const complaintSummary = bucketComplaintCounts(complaintCount);
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

    const [neighborhoodOverview, wardOverview, departmentOverview] =
        await Promise.all([
            context.audience === "neighborhood"
                ? buildNeighborhoodOverview({
                      context,
                      capabilities,
                      houses,
                      households,
                      latestPccc,
                      newComplaints,
                      inProgressComplaints,
                      requestReport,
                      complaintSummary,
                  })
                : Promise.resolve(undefined),
            WARD_FAMILY_AUDIENCES.includes(context.audience)
                ? buildWardOverview(context, capabilities, complaintSummary)
                : Promise.resolve(undefined),
            WARD_FAMILY_AUDIENCES.includes(context.audience) &&
            context.audience !== "ward"
                ? buildDepartmentOverview(context, capabilities)
                : Promise.resolve(undefined),
        ]);

    return {
        neighborhoodOverview,
        departmentOverview,
        wardOverview,
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

/**
 * Chi tinh cho audience "neighborhood" (to truong/to pho - xem
 * dashboardAreaContext). Cong tac vien (neighborhood_collaborator) khong
 * thuoc audience nay nen khong nhan duoc khoi du lieu toan To o day - ho van
 * chi thay du lieu duoc giao rieng qua cac man hinh chuyen biet (giong quy
 * uoc cua areaScopeFilter trong lib/rbac.ts).
 */
async function buildNeighborhoodOverview(args: {
    context: DashboardAreaContext;
    capabilities: {
        population: boolean;
        complaints: boolean;
        pccc: boolean;
        business: boolean;
    };
    houses: Array<{ _id: unknown; status: HouseRecordStatus }>;
    households: Array<{
        _id: unknown;
        houseId?: unknown;
        needsSupport?: boolean;
        isNearPoor?: boolean;
        diseaseStatus?: string;
    }>;
    latestPccc: Array<{ _id: unknown; riskLevel: string; followUpStatus?: string }>;
    newComplaints: number;
    inProgressComplaints: number;
    requestReport?: RequestReport;
    complaintSummary: ComplaintSummary;
}): Promise<NeighborhoodOverview> {
    const {
        context,
        capabilities,
        houses,
        households,
        latestPccc,
        newComplaints,
        inProgressComplaints,
        requestReport,
        complaintSummary,
    } = args;
    const houseIds = houses.map(house => house._id);
    const householdIds = households.map(household => household._id);
    const occupiedHouseIds = new Set(
        households
            .map(household => household.houseId && String(household.houseId))
            .filter((value): value is string => Boolean(value)),
    );

    const militaryAgeRange = birthDateRangeForAge(
        MILITARY_AGE_MIN,
        MILITARY_AGE_MAX,
        new Date(),
    );
    const [
        residenceTypeRows,
        renterAgg,
        elderlyCount,
        childCount,
        womenCount,
        veteranCount,
        martyrCount,
        unemployedCount,
        militaryAgeMenCount,
        undeclaredResidencyCount,
        businesses,
        companies,
        complaintQuality,
    ] = await Promise.all([
        capabilities.population && householdIds.length > 0
            ? Citizen.aggregate([
                  { $match: { householdId: { $in: householdIds } } },
                  { $group: { _id: "$residenceType", count: { $sum: 1 } } },
              ])
            : Promise.resolve([]),
        capabilities.population && houseIds.length > 0
            ? ResidentRecord.aggregate([
                  { $match: { houseId: { $in: houseIds } } },
                  { $group: { _id: null, total: { $sum: "$renterCount" } } },
              ])
            : Promise.resolve([]),
        capabilities.population && householdIds.length > 0
            ? Citizen.countDocuments({
                  householdId: { $in: householdIds },
                  isElderly: true,
              })
            : Promise.resolve(0),
        capabilities.population && householdIds.length > 0
            ? Citizen.countDocuments({
                  householdId: { $in: householdIds },
                  isChild: true,
              })
            : Promise.resolve(0),
        capabilities.population && householdIds.length > 0
            ? Citizen.countDocuments({
                  householdId: { $in: householdIds },
                  gender: "nu",
              })
            : Promise.resolve(0),
        capabilities.population && householdIds.length > 0
            ? Citizen.countDocuments({
                  householdId: { $in: householdIds },
                  isVeteran: true,
              })
            : Promise.resolve(0),
        capabilities.population && householdIds.length > 0
            ? Citizen.countDocuments({
                  householdId: { $in: householdIds },
                  $or: [{ isMartyr: true }, { isMartyrFamily: true }],
              })
            : Promise.resolve(0),
        capabilities.population && householdIds.length > 0
            ? Citizen.countDocuments({
                  householdId: { $in: householdIds },
                  isUnemployed: true,
              })
            : Promise.resolve(0),
        capabilities.population && householdIds.length > 0
            ? Citizen.countDocuments({
                  householdId: { $in: householdIds },
                  gender: "nam",
                  birthDate: {
                      $gte: militaryAgeRange.from,
                      $lte: militaryAgeRange.to,
                  },
              })
            : Promise.resolve(0),
        capabilities.population && householdIds.length > 0
            ? Citizen.countDocuments({
                  householdId: { $in: householdIds },
                  isResidencyDeclared: false,
              })
            : Promise.resolve(0),
        capabilities.business
            ? Business.find(context.areaFilter).select(
                  "_id houseId status businessType",
              )
            : Promise.resolve([]),
        capabilities.business
            ? Company.find(context.areaFilter).select("_id houseId status active")
            : Promise.resolve([]),
        capabilities.complaints
            ? getComplaintQualityMetrics(context.complaintFilter)
            : Promise.resolve(null),
    ]);
    const poorHouseholdsCount = households.filter(
        household => household.isNearPoor,
    ).length;
    const diseaseMonitoredHouseholdsCount = households.filter(
        household => household.diseaseStatus && household.diseaseStatus !== "none",
    ).length;

    const businessHouseIds = new Set(
        [...businesses, ...companies]
            .map(row => row.houseId && String(row.houseId))
            .filter((value): value is string => Boolean(value)),
    );
    const businessIds = businesses.map(business => business._id);
    const businessDocRows = businessIds.length
        ? await BusinessDocument.find({
              businessId: { $in: businessIds },
              active: true,
          }).select("businessId expiryDate")
        : [];
    const businessIdsWithDoc = new Set(
        businessDocRows.map(doc => String(doc.businessId)),
    );
    const expiryThreshold = new Date();
    expiryThreshold.setDate(
        expiryThreshold.getDate() + BUSINESS_LICENSE_EXPIRING_DAYS,
    );
    const expiringLicenses = businessDocRows.filter(
        doc => doc.expiryDate && doc.expiryDate <= expiryThreshold,
    ).length;
    const missingLicense = businesses.filter(
        business => !businessIdsWithDoc.has(String(business._id)),
    ).length;
    const needsReview = [...businesses, ...companies].filter(
        row => row.status === "pending",
    ).length;
    const businessTypeIds = businesses
        .map(business => business.businessType)
        .filter((id): id is NonNullable<typeof id> => Boolean(id));
    const businessTypes = businessTypeIds.length
        ? await BusinessType.find({ _id: { $in: businessTypeIds } }).select(
              "name",
          )
        : [];
    const businessTypeNameById = new Map(
        businessTypes.map(type => [String(type._id), type.name]),
    );
    const byIndustryMap = new Map<string, number>();
    for (const business of businesses) {
        const label = business.businessType
            ? businessTypeNameById.get(String(business.businessType)) ||
              "Không xác định"
            : "Chưa phân loại";
        byIndustryMap.set(label, (byIndustryMap.get(label) || 0) + 1);
    }

    const statusCount = (status: HouseRecordStatus) =>
        houses.filter(house => house.status === status).length;
    const residenceTypeCount = new Map(
        residenceTypeRows.map(row => [row._id, Number(row.count)]),
    );

    return {
        houses: {
            total: houses.length,
            verified: statusCount("verified"),
            unverified: statusCount("unverified"),
            pending: statusCount("pending"),
            needsAttention:
                statusCount("denied") +
                statusCount("needs_update") +
                statusCount("locked"),
            occupied: occupiedHouseIds.size,
            business: businessHouseIds.size,
            vacant: houses.filter(
                house =>
                    !occupiedHouseIds.has(String(house._id)) &&
                    !businessHouseIds.has(String(house._id)),
            ).length,
        },
        population: {
            households: households.length,
            citizens: [...residenceTypeCount.values()].reduce(
                (sum, count) => sum + count,
                0,
            ),
            permanentResidents: residenceTypeCount.get("thuong_tru") || 0,
            temporaryResidents: residenceTypeCount.get("tam_tru") || 0,
            renters: renterAgg[0]?.total || 0,
            elderly: elderlyCount,
            children: childCount,
            needsSupport: households.filter(household => household.needsSupport)
                .length,
            women: womenCount,
            veterans: veteranCount,
            martyrs: martyrCount,
            poorHouseholds: poorHouseholdsCount,
            unemployed: unemployedCount,
            militaryAgeMen: militaryAgeMenCount,
            undeclaredResidency: undeclaredResidencyCount,
            diseaseMonitoredHouseholds: diseaseMonitoredHouseholdsCount,
            registeredHouses: statusCount("verified"),
        },
        business: {
            dataAvailable: capabilities.business,
            total: businesses.length,
            totalCompanies: companies.length,
            byIndustry: [...byIndustryMap.entries()].map(([label, count]) => ({
                label,
                count,
            })),
            missingLicense,
            expiringLicenses,
            needsReview,
        },
        safety: {
            dataAvailable: capabilities.pccc,
            housesNotInspected: capabilities.pccc
                ? Math.max(houseIds.length - latestPccc.length, 0)
                : 0,
            highRiskPccc: latestPccc.filter(row => row.riskLevel === "do")
                .length,
            urgentSecurity: 0,
            unresolvedRecommendations: latestPccc.filter(
                row => row.followUpStatus && row.followUpStatus !== "da_khac_phuc",
            ).length,
            openComplaints: newComplaints + inProgressComplaints,
        },
        tasks: {
            newComplaints,
            inProgressComplaints,
            overdueRequestAssignments: requestReport?.overdueAssignments || 0,
            resolvedRequestAssignments: requestReport?.resolvedAssignments || 0,
            totalRequestAssignments:
                requestReport?.totalRecipientAssignments || 0,
            onTimeCompletionRate: complaintQuality?.onTimeRate ?? null,
            averageSatisfaction: complaintQuality?.averageRating ?? null,
            ratedComplaintCount: complaintQuality?.ratedCount || 0,
        },
        complaintSummary,
    };
}

async function getComplaintQualityMetrics(
    complaintFilter: Record<string, unknown>,
): Promise<{
    onTimeRate: number | null;
    averageRating: number | null;
    ratedCount: number;
}> {
    const rows = await Complaint.aggregate([
        {
            $match: {
                ...complaintFilter,
                status: { $in: COMPLAINT_TERMINAL_STATUSES },
            },
        },
        {
            $group: {
                _id: null,
                completed: { $sum: 1 },
                onTime: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ["$expectedCompletionDate", null] },
                                    { $ne: ["$actualCompletionDate", null] },
                                    {
                                        $lte: [
                                            "$actualCompletionDate",
                                            "$expectedCompletionDate",
                                        ],
                                    },
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                withDueDate: {
                    $sum: {
                        $cond: [
                            { $ne: ["$expectedCompletionDate", null] },
                            1,
                            0,
                        ],
                    },
                },
                ratedCount: {
                    $sum: { $cond: [{ $ne: ["$rating", null] }, 1, 0] },
                },
                ratingSum: { $sum: { $ifNull: ["$rating", 0] } },
            },
        },
    ]);
    const row = rows[0];
    if (!row) return { onTimeRate: null, averageRating: null, ratedCount: 0 };
    return {
        onTimeRate:
            row.withDueDate > 0
                ? Number(((row.onTime / row.withDueDate) * 100).toFixed(1))
                : null,
        averageRating:
            row.ratedCount > 0
                ? Number((row.ratingSum / row.ratedCount).toFixed(2))
                : null,
        ratedCount: row.ratedCount || 0,
    };
}

/**
 * Chi tinh cho audience "ward" (bi thu/can bo UBND/vai tro Phuong tuy chinh -
 * xem dashboardAreaContext). Dung context.neighborhoodIds (danh sach To thuoc
 * Phuong duoc phan cong) de tong hop tung To va toan Phuong.
 */
async function buildWardOverview(
    context: DashboardAreaContext,
    capabilities: { population: boolean; complaints: boolean; pccc: boolean; business: boolean },
    complaintSummary: ComplaintSummary,
): Promise<WardOverview> {
    const neighborhoodIds = context.neighborhoodIds;
    if (neighborhoodIds.length === 0) {
        return {
            neighborhoods: [],
            houseSummary: { neighborhoods: 0, houses: 0, owners: 0, businessUnits: 0 },
            complaintSummary,
            dataQuality: {
                duplicateAddressGroups: 0,
                duplicateAddressHouses: 0,
                otherChecksAvailable: false,
            },
            population: {
                households: 0,
                citizens: 0,
                renters: 0,
                elderly: 0,
                childrenApprox: 0,
                needsSupport: 0,
            },
            economy: {
                dataAvailable: capabilities.business,
                total: 0,
                totalCompanies: 0,
                byIndustry: [],
                expiringLicenses: 0,
                newInPeriod: 0,
                inactive: 0,
            },
            safety: {
                dataAvailable: capabilities.pccc,
                highRiskPccc: 0,
                urgentSecurity: 0,
                housesNotInspected: 0,
                byNeighborhood: [],
            },
            digitalServicesAvailable: false,
            systemSafetyAvailable: false,
        };
    }

    const [
        neighborhoods,
        houseRows,
        duplicateAddressRows,
        householdRows,
        latestPcccByHouse,
        complaintByNeighborhood,
        businesses,
        companies,
    ] = await Promise.all([
        Neighborhood.find({ _id: { $in: neighborhoodIds } }).select("name"),
        HouseRecord.find({ neighborhoodId: { $in: neighborhoodIds } }).select(
            "_id neighborhoodId status updatedAt",
        ),
        HouseRecord.aggregate([
            { $match: { neighborhoodId: { $in: neighborhoodIds } } },
            {
                $group: {
                    _id: { neighborhoodId: "$neighborhoodId", address: "$address" },
                    count: { $sum: 1 },
                },
            },
            { $match: { count: { $gt: 1 } } },
        ]),
        capabilities.population
            ? Household.find({
                  neighborhoodId: { $in: neighborhoodIds },
              }).select("_id houseId needsSupport isNearPoor diseaseStatus")
            : Promise.resolve([]),
        capabilities.pccc
            ? PcccCheck.aggregate([
                  {
                      $lookup: {
                          from: "houses",
                          localField: "houseId",
                          foreignField: "_id",
                          as: "house",
                      },
                  },
                  { $unwind: "$house" },
                  {
                      $match: {
                          "house.neighborhoodId": { $in: neighborhoodIds },
                      },
                  },
                  { $sort: { houseId: 1, inspectionDate: -1, createdAt: -1 } },
                  {
                      $group: {
                          _id: "$houseId",
                          riskLevel: { $first: "$riskLevel" },
                          neighborhoodId: { $first: "$house.neighborhoodId" },
                      },
                  },
              ])
            : Promise.resolve([]),
        capabilities.complaints
            ? Complaint.aggregate([
                  {
                      $match: {
                          neighborhoodId: { $in: neighborhoodIds },
                          status: { $nin: COMPLAINT_TERMINAL_STATUSES },
                      },
                  },
                  { $group: { _id: "$neighborhoodId", count: { $sum: 1 } } },
              ])
            : Promise.resolve([]),
        capabilities.business
            ? Business.find({
                  neighborhoodId: { $in: neighborhoodIds },
              }).select("_id status businessType active createdAt")
            : Promise.resolve([]),
        capabilities.business
            ? Company.find({
                  neighborhoodId: { $in: neighborhoodIds },
              }).select("_id status active createdAt")
            : Promise.resolve([]),
    ]);

    const neighborhoodNameById = new Map(
        neighborhoods.map(neighborhood => [
            String(neighborhood._id),
            neighborhood.name,
        ]),
    );
    const householdsByNeighborhood = new Map<string, typeof householdRows>();
    for (const household of householdRows) {
        const key = String(household.neighborhoodId || "");
        const list = householdsByNeighborhood.get(key) || [];
        list.push(household);
        householdsByNeighborhood.set(key, list);
    }
    const highAlertByNeighborhood = new Map<string, number>();
    for (const row of latestPcccByHouse) {
        if (row.riskLevel !== "do") continue;
        const key = String(row.neighborhoodId || "");
        highAlertByNeighborhood.set(key, (highAlertByNeighborhood.get(key) || 0) + 1);
    }
    const openComplaintsByNeighborhood = new Map(
        complaintByNeighborhood.map(row => [String(row._id), Number(row.count)]),
    );

    const housesByNeighborhood = new Map<string, typeof houseRows>();
    for (const house of houseRows) {
        const key = String(house.neighborhoodId || "");
        const list = housesByNeighborhood.get(key) || [];
        list.push(house);
        housesByNeighborhood.set(key, list);
    }

    const neighborhoodRows: WardNeighborhoodRow[] = neighborhoodIds.map(id => {
        const key = String(id);
        const rows = housesByNeighborhood.get(key) || [];
        const verified = rows.filter(row => row.status === "verified").length;
        const verificationRate =
            rows.length > 0 ? Number(((verified / rows.length) * 100).toFixed(1)) : 0;
        const lastUpdatedAt = rows.reduce<Date | null>((latest, row) => {
            if (!row.updatedAt) return latest;
            return !latest || row.updatedAt > latest ? row.updatedAt : latest;
        }, null);
        const highAlertCount = highAlertByNeighborhood.get(key) || 0;
        return {
            neighborhoodId: key,
            name: neighborhoodNameById.get(key) || "Tổ dân phố",
            totalHouses: rows.length,
            verifiedHouses: verified,
            verificationRate,
            lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
            isSlow: rows.length > 0 && verificationRate < WARD_SLOW_VERIFICATION_RATE,
            highAlertCount,
            isHighAlert: highAlertCount >= WARD_HIGH_ALERT_THRESHOLD,
        };
    });

    const duplicateAddressHouses = duplicateAddressRows.reduce(
        (sum, row) => sum + Number(row.count),
        0,
    );

    const householdIdsForWard = householdRows.map(household => household._id);
    const houseIdsForWard = houseRows.map(house => house._id);
    const [citizenCount, elderlyCount, childCount, renterAgg, ownerIds] =
        await Promise.all([
            capabilities.population && householdIdsForWard.length > 0
                ? Citizen.countDocuments({
                      householdId: { $in: householdIdsForWard },
                  })
                : Promise.resolve(0),
            capabilities.population && householdIdsForWard.length > 0
                ? Citizen.countDocuments({
                      householdId: { $in: householdIdsForWard },
                      isElderly: true,
                  })
                : Promise.resolve(0),
            capabilities.population && householdIdsForWard.length > 0
                ? Citizen.countDocuments({
                      householdId: { $in: householdIdsForWard },
                      isChild: true,
                  })
                : Promise.resolve(0),
            capabilities.population && houseIdsForWard.length > 0
                ? ResidentRecord.aggregate([
                      { $match: { houseId: { $in: houseIdsForWard } } },
                      { $group: { _id: null, total: { $sum: "$renterCount" } } },
                  ])
                : Promise.resolve([]),
            // "Chu so huu" = so nguoi/to chuc dang dung ten so huu/quan ly it
            // nhat 1 nha trong Phuong (khong phan biet primary_owner/co_owner/
            // authorized_manager - xem models/HouseOwnership.ts).
            houseIdsForWard.length > 0
                ? HouseOwnership.distinct("ownerId", {
                      houseId: { $in: houseIdsForWard },
                      active: true,
                  })
                : Promise.resolve([]),
        ]);

    const businessTypeIds = businesses
        .map(business => business.businessType)
        .filter((id): id is NonNullable<typeof id> => Boolean(id));
    const businessTypes = businessTypeIds.length
        ? await BusinessType.find({ _id: { $in: businessTypeIds } }).select(
              "name",
          )
        : [];
    const businessTypeNameById = new Map(
        businessTypes.map(type => [String(type._id), type.name]),
    );
    const byIndustryMap = new Map<string, number>();
    for (const business of businesses) {
        const label = business.businessType
            ? businessTypeNameById.get(String(business.businessType)) ||
              "Không xác định"
            : "Chưa phân loại";
        byIndustryMap.set(label, (byIndustryMap.get(label) || 0) + 1);
    }
    const businessIds = businesses.map(business => business._id);
    const expiryThreshold = new Date();
    expiryThreshold.setDate(
        expiryThreshold.getDate() + BUSINESS_LICENSE_EXPIRING_DAYS,
    );
    const expiringLicenses = businessIds.length
        ? await BusinessDocument.countDocuments({
              businessId: { $in: businessIds },
              active: true,
              expiryDate: { $lte: expiryThreshold, $ne: null },
          })
        : 0;
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 30);
    const newInPeriod = [...businesses, ...companies].filter(
        row => row.createdAt && row.createdAt >= periodStart,
    ).length;
    const inactive = [...businesses, ...companies].filter(
        row => row.active === false,
    ).length;

    return {
        neighborhoods: neighborhoodRows,
        houseSummary: {
            neighborhoods: neighborhoodIds.length,
            houses: houseRows.length,
            owners: ownerIds.length,
            businessUnits: businesses.length + companies.length,
        },
        complaintSummary,
        dataQuality: {
            duplicateAddressGroups: duplicateAddressRows.length,
            duplicateAddressHouses,
            otherChecksAvailable: false,
        },
        population: {
            households: householdRows.length,
            citizens: citizenCount,
            renters: renterAgg[0]?.total || 0,
            elderly: elderlyCount,
            childrenApprox: childCount,
            needsSupport: householdRows.filter(
                (household: { needsSupport?: boolean }) => household.needsSupport,
            ).length,
        },
        economy: {
            dataAvailable: capabilities.business,
            total: businesses.length,
            totalCompanies: companies.length,
            byIndustry: [...byIndustryMap.entries()].map(([label, count]) => ({
                label,
                count,
            })),
            expiringLicenses,
            newInPeriod,
            inactive,
        },
        safety: {
            dataAvailable: capabilities.pccc,
            highRiskPccc: latestPcccByHouse.filter(row => row.riskLevel === "do")
                .length,
            urgentSecurity: 0,
            housesNotInspected: capabilities.pccc
                ? Math.max(houseRows.length - latestPcccByHouse.length, 0)
                : 0,
            byNeighborhood: neighborhoodIds.map(id => {
                const key = String(id);
                return {
                    neighborhoodId: key,
                    name: neighborhoodNameById.get(key) || "Tổ dân phố",
                    highRiskPccc: highAlertByNeighborhood.get(key) || 0,
                    urgentSecurity: 0,
                    openComplaints: openComplaintsByNeighborhood.get(key) || 0,
                };
            }),
        },
        digitalServicesAvailable: false,
        systemSafetyAvailable: false,
    };
}

/**
 * Khoi du lieu RIENG cho 1 trong 5 "phong ban" cap Phuong (police/
 * social_affairs/health/education/economy_labor) - CHI goi khi audience khac
 * "ward" (xem getDashboardSummary). Dung chung context.neighborhoodIds (da
 * tinh san boi dashboardAreaContext, giong buildWardOverview) de quet toan bo
 * Phuong, khong phai rieng mot To dan pho.
 */
async function buildDepartmentOverview(
    context: DashboardAreaContext,
    capabilities: { population: boolean; business: boolean },
): Promise<DepartmentOverview> {
    const neighborhoodIds = context.neighborhoodIds;
    if (neighborhoodIds.length === 0 || !capabilities.population) return {};

    const householdIds = await Household.distinct("_id", {
        neighborhoodId: { $in: neighborhoodIds },
    });
    const citizenFilter = (extra: Record<string, unknown>) =>
        householdIds.length > 0
            ? Citizen.countDocuments({ householdId: { $in: householdIds }, ...extra })
            : Promise.resolve(0);

    switch (context.audience) {
        case "police": {
            const militaryAgeRange = birthDateRangeForAge(
                MILITARY_AGE_MIN,
                MILITARY_AGE_MAX,
                new Date(),
            );
            const [undeclaredResidency, militaryAgeMen] = await Promise.all([
                citizenFilter({ isResidencyDeclared: false }),
                citizenFilter({
                    gender: "nam",
                    birthDate: {
                        $gte: militaryAgeRange.from,
                        $lte: militaryAgeRange.to,
                    },
                }),
            ]);
            return { police: { undeclaredResidency, militaryAgeMen } };
        }
        case "social_affairs": {
            const [women, elderly, children, veterans, martyrs, poorHouseholds] =
                await Promise.all([
                    citizenFilter({ gender: "nu" }),
                    citizenFilter({ isElderly: true }),
                    citizenFilter({ isChild: true }),
                    citizenFilter({ isVeteran: true }),
                    citizenFilter({ $or: [{ isMartyr: true }, { isMartyrFamily: true }] }),
                    Household.countDocuments({
                        neighborhoodId: { $in: neighborhoodIds },
                        isNearPoor: true,
                    }),
                ]);
            return {
                socialAffairs: {
                    women,
                    elderly,
                    children,
                    veterans,
                    martyrs,
                    poorHouseholds,
                },
            };
        }
        case "health": {
            const diseaseMonitoredHouseholds = await Household.countDocuments({
                neighborhoodId: { $in: neighborhoodIds },
                diseaseStatus: { $ne: "none" },
            });
            return { health: { diseaseMonitoredHouseholds } };
        }
        case "education": {
            const schoolAgeRange = birthDateRangeForAge(
                SCHOOL_AGE_MIN,
                SCHOOL_AGE_MAX,
                new Date(),
            );
            const schoolAgeChildren = await citizenFilter({
                birthDate: { $gte: schoolAgeRange.from, $lte: schoolAgeRange.to },
            });
            return { education: { schoolAgeChildren } };
        }
        case "economy_labor": {
            const [businessCount, companyCount, unemployed] = await Promise.all([
                capabilities.business
                    ? Business.countDocuments({ neighborhoodId: { $in: neighborhoodIds } })
                    : Promise.resolve(0),
                capabilities.business
                    ? Company.countDocuments({ neighborhoodId: { $in: neighborhoodIds } })
                    : Promise.resolve(0),
                citizenFilter({ isUnemployed: true }),
            ]);
            return {
                economyLabor: {
                    businessUnits: businessCount + companyCount,
                    unemployed,
                },
            };
        }
        default:
            return {};
    }
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
