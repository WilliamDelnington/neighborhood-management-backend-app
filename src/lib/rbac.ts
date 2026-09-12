import { getSessionFromRequest } from "@/lib/auth";
import { HttpError } from "@/lib/response";
import UserModel, { type IUser } from "@/models/User";
import RoleModel from "@/models/Role";
import NeighborhoodModel from "@/models/Neighborhood";
import {
    LEGACY_COOPERATOR_ROLE_KEY,
    isCollaboratorOrLegacyCooperator,
} from "@/lib/systemRoles";
import type { Role, SessionTokenPayload } from "@/types";

/**
 * Tra ve session tu JWT trong header Authorization. Nem HttpError(401) neu thieu/invalid.
 */
export function requireSession(req: Request): SessionTokenPayload {
    const session = getSessionFromRequest(req);
    if (!session) {
        throw new HttpError("Ban can dang nhap de thuc hien thao tac nay", 401);
    }
    return session;
}

/**
 * Nem HttpError(403) neu subject khong co bat ky role nao trong danh sach cho phep.
 * Nhan mot subject bat ky co truong `roles` (ca SessionTokenPayload lan IUser deu
 * thoa man) - luon uu tien truyen vao IUser (tu requireUser) thay vi SessionTokenPayload
 * de kiem tra dua tren du lieu MOI NHAT trong DB, khong phai ban sao cu luu trong JWT
 * (JWT ton tai toi 30 ngay - neu role bi thu hoi ma van chi kiem tra qua JWT thi quyen
 * cu se con hieu luc cho den khi token het han).
 */
export function requireRole(
    subject: { roles: Role[] },
    ...allowed: Role[]
): void {
    const hasRole = subject.roles.some(r => allowed.includes(r));
    if (!hasRole) {
        throw new HttpError("Ban khong co quyen thuc hien thao tac nay", 403);
    }
}

// Cac duong dan duy nhat con duoc phep goi khi User.mustChangePassword=true
// (xem ghi chu chi tiet ben duoi requireUser) - phai du de: (1) tu doi mat
// khau (set-password), (2) doc thong tin ban than de UI biet mustChangePassword
// da tat chua/hien thi thong tin co ban (me), (3) dang xuat neu khong muon
// doi ngay. Moi API khac deu bi chan 423 cho toi khi doi mat khau xong.
const MUST_CHANGE_PASSWORD_EXEMPT_PATHS = [
    "/api/auth/set-password",
    "/api/auth/me",
    "/api/auth/logout",
];

/**
 * Tai ve document User day du (can cho scope filtering: assignedClusters, householdId...).
 * Nem HttpError(401) neu tai khoan khong con ton tai hoac bi khoa.
 */
export async function requireUser(req: Request): Promise<IUser> {
    const session = requireSession(req);
    let user = await UserModel.findById(session.userId);
    if (!user || user.status === "locked") {
        throw new HttpError("Tài khoản không hợp lệ hoặc đã bị khóa", 401);
    }
    if (user.sessionVersion !== session.sv) {
        throw new HttpError(
            "Phien dang nhap da het hieu luc, vui long dang nhap lai",
            401,
        );
    }
    // Mat khau hien tai la do nguoi khac dat thay (import Excel, nhan vien
    // tao ho, admin dat lai - xem User.mustChangePassword) - chan MOI API
    // khac ngoai danh sach cho phep o tren cho toi khi tu doi mat khau qua
    // authService.setPassword (tu dong tat flag nay). Dung 423 (Locked, KHONG
    // phai 401/403 da co y nghia khac trong he thong nay) de client phan
    // biet duoc va tu dong chuyen huong sang man doi mat khau bat buoc, thay
    // vi hien loi chung chung.
    if (user.mustChangePassword) {
        const pathname = new URL(req.url).pathname;
        const isExempt = MUST_CHANGE_PASSWORD_EXEMPT_PATHS.includes(pathname);
        if (!isExempt) {
            throw new HttpError(
                "Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng",
                423,
            );
        }
    }
    // Chi Cong tac vien (neighborhood_collaborator/cooperator) con co endAt
    // rieng tren tung phan cong de tu dong het han (xem
    // expireNeighborhoodOfficerAssignments) - To truong/To pho la "active cho
    // den khi duoc go tay" tu khi bo khai niem nhiem ky, khong con gi de quet
    // o day cho hai vai tro do nua.
    if (isCollaboratorOrLegacyCooperator(user.roles)) {
        const { expireNeighborhoodOfficerAssignments } = await import(
            "@/services/neighborhoodService"
        );
        const expired = await expireNeighborhoodOfficerAssignments(String(user._id));
        if (expired > 0) {
            user = await UserModel.findById(session.userId);
            if (!user) {
                throw new HttpError("Tài khoản không hợp lệ hoặc đã bị khóa", 401);
            }
        }
    }
    return user;
}

/**
 * Nhu requireUser nhung KHONG nem loi - tra ve null neu thieu/invalid token
 * (thay vi 401/423). Dung cho API cong khai muon ca nhan hoa ket qua cho
 * nguoi da dang nhap (vd loc khao sat theo dieu kien du dieu kien cua chinh
 * ho) ma khong bat buoc dang nhap moi xem duoc.
 */
export async function optionalUser(req: Request): Promise<IUser | null> {
    try {
        return await requireUser(req);
    } catch {
        return null;
    }
}

export function isAdmin(session: SessionTokenPayload): boolean {
    return session.roles.includes("admin");
}

/**
 * Tao mot Role "placeholder" (inactive) cho key chua ton tai trong bang Role,
 * de admin thay va tu xu ly (gan permission hoac xoa vai tro do khoi user).
 * Khong throw loi - day chi la buoc tu-hoi-phuc, khong duoc lam gian doan
 * viec tinh permission cua request hien tai.
 */
async function ensurePlaceholderRole(key: string): Promise<void> {
    try {
        await RoleModel.findOneAndUpdate(
            { key },
            {
                $setOnInsert: {
                    key,
                    name: key,
                    description: "Vai trò được tạo tự động do chưa có cấu hình - vui lòng kiểm tra lại",
                    permissions: [],
                    system: false,
                    active: false,
                    sortOrder: 999,
                },
            },
            { upsert: true },
        );
    } catch (err) {
        console.error(`Khong the tao placeholder Role cho key "${key}":`, err);
    }
}

/**
 * Tinh tap hop permission hieu luc cua user: hop cac permission tu moi Role
 * dang active ma user duoc gan, hop them permissions rieng cua user (override
 * o cap ca nhan). Khong cache qua request - quy mo du lieu hien tai khong can.
 * Key trong user.roles ma khong co Role tuong ung se bi bo qua (khong cap
 * permission nao) va duoc tu dong tao thanh placeholder inactive de admin xem.
 */
export async function getUserPermissionSet(user: IUser): Promise<Set<string>> {
    const roleKeys = user.roles || [];
    const roleDocs = await RoleModel.find({ key: { $in: roleKeys } });

    const existingKeys = new Set(roleDocs.map(r => r.key));
    const unknownKeys = roleKeys.filter(key => !existingKeys.has(key));
    if (unknownKeys.length > 0) {
        await Promise.all(unknownKeys.map(ensurePlaceholderRole));
    }

    const permissions = new Set<string>();
    for (const role of roleDocs) {
        if (!role.active) continue;
        for (const permission of role.permissions) permissions.add(permission);
    }
    for (const permission of user.permissions || []) permissions.add(permission);
    return permissions;
}

export async function userHasPermission(
    user: IUser,
    permission: string,
): Promise<boolean> {
    const permissions = await getUserPermissionSet(user);
    return permissions.has(permission);
}

export async function requirePermission(
    user: IUser,
    permission: string,
): Promise<void> {
    if (!(await userHasPermission(user, permission))) {
        throw new HttpError("Ban khong co quyen thuc hien thao tac nay", 403);
    }
}

export async function requireAnyPermission(
    user: IUser,
    permissions: string[],
): Promise<void> {
    const granted = await getUserPermissionSet(user);
    const hasAny = permissions.some(p => granted.has(p));
    if (!hasAny) {
        throw new HttpError("Ban khong co quyen thuc hien thao tac nay", 403);
    }
}

export async function requireAllPermissions(
    user: IUser,
    permissions: string[],
): Promise<void> {
    const granted = await getUserPermissionSet(user);
    const missing = permissions.some(p => !granted.has(p));
    if (missing) {
        throw new HttpError("Ban khong co quyen thuc hien thao tac nay", 403);
    }
}

/**
 * Tra ve danh sach key cua cac Role dang active co chua permission truyen vao.
 * Dung khi can tim "nhung ai co the..." dua tren permission thay vi role key
 * co dinh (vd danh sach nhan vien co the duoc gan phu trach phan anh).
 */
export async function getRoleKeysWithPermission(
    permission: string,
): Promise<string[]> {
    const roles = await RoleModel.find({
        active: true,
        permissions: permission,
    }).select("key");
    return roles.map(r => r.key);
}

/**
 * Tra ve danh sach nhom phan anh (category) ma user duoc phep xem, hoac null
 * neu khong bi gioi han (xem tat ca - hanh vi mac dinh). User bi gioi han chi
 * khi TAT CA cac role dang active cua ho deu da duoc admin "chot" danh sach
 * allowedComplaintCategories; neu bat ky role nao chua duoc cau hinh (hoac
 * khong tim thay role active nao - vd permission den tu user.permissions rieng)
 * thi coi nhu khong gioi han, giu nguyen hanh vi truoc khi co tinh nang nay.
 * Nhieu role bi gioi han thi hop (union) danh sach cua tung role lai.
 */
export async function getUserAllowedComplaintCategories(
    user: IUser,
): Promise<string[] | null> {
    if (user.roles.includes("admin")) return null;

    const roleDocs = await RoleModel.find({
        key: { $in: user.roles },
        active: true,
    });
    if (roleDocs.length === 0) return null;

    const hasUnrestrictedRole = roleDocs.some(
        r => r.allowedComplaintCategories === undefined,
    );
    if (hasUnrestrictedRole) return null;

    const allowed = new Set<string>();
    for (const role of roleDocs) {
        for (const category of role.allowedComplaintCategories || []) {
            allowed.add(category);
        }
    }
    return [...allowed];
}

/**
 * Tra ve danh sach loai yeu cau (RequestType) ma user duoc phep gui, hoac null
 * neu khong bi gioi han. Cung quy uoc voi getUserAllowedComplaintCategories:
 * chi gioi han khi TAT CA cac role dang active cua user deu da duoc admin
 * "chot" danh sach allowedRequestTypes; nhieu role bi gioi han thi hop (union).
 */
export async function getUserAllowedRequestTypes(
    user: IUser,
): Promise<string[] | null> {
    if (user.roles.includes("admin")) return null;

    const roleDocs = await RoleModel.find({
        key: { $in: user.roles },
        active: true,
    });
    if (roleDocs.length === 0) return null;

    const hasUnrestrictedRole = roleDocs.some(
        r => r.allowedRequestTypes === undefined,
    );
    if (hasUnrestrictedRole) return null;

    const allowed = new Set<string>();
    for (const role of roleDocs) {
        for (const type of role.allowedRequestTypes || []) {
            allowed.add(type);
        }
    }
    return [...allowed];
}

/**
 * Tra ve danh sach DashboardMetricKey (xem types/index.ts) ma user duoc phep
 * xem tren dashboard, hoac null neu khong gioi han (giu nguyen bo so lieu co
 * dinh theo audience nhu truoc day - xem dashboardService.ts). Cung quy uoc
 * voi getUserAllowedComplaintCategories/getUserAllowedRequestTypes: chi gioi
 * han khi TAT CA cac role dang active cua user deu da duoc admin "chot" danh
 * sach dashboardMetrics; nhieu role bi gioi han thi hop (union).
 */
export async function getUserAllowedDashboardMetrics(
    user: IUser,
): Promise<string[] | null> {
    if (user.roles.includes("admin")) return null;

    const roleDocs = await RoleModel.find({
        key: { $in: user.roles },
        active: true,
    });
    if (roleDocs.length === 0) return null;

    const hasUnrestrictedRole = roleDocs.some(
        r => r.dashboardMetrics === undefined,
    );
    if (hasUnrestrictedRole) return null;

    const allowed = new Set<string>();
    for (const role of roleDocs) {
        for (const metric of role.dashboardMetrics || []) {
            allowed.add(metric);
        }
    }
    return [...allowed];
}

/**
 * Xay dung dieu kien Mongo de loc du lieu theo cum dan cu duoc phan cong,
 * tru khi user la admin (xem toan bo) hoac co scope "all".
 */
export function clusterScopeFilter(
    user: IUser,
    clusterField = "cluster",
): Record<string, unknown> {
    if (user.roles.includes("admin")) return {};
    if (!user.assignedClusters || user.assignedClusters.length === 0) return {};
    return { [clusterField]: { $in: user.assignedClusters } };
}

/**
 * Xay dung dieu kien Mongo de loc du lieu theo to dan pho (Neighborhood) duoc
 * phan cong. Khac voi clusterScopeFilter: khong co to dan pho nao duoc gan
 * (neighborhoodId + assignedNeighborhoodIds deu rong) nghia la KHONG THAY GI
 * ca, chu khong phai xem tat ca - cung quy uoc voi
 * neighborhoodService.ownNeighborhoodIds, vi to truong chua duoc gan to dan
 * pho da bi chan vao thang o frontend (RequireNeighborhoodAssignment), backend
 * nen tu choi thay vi ngam dinh khong gioi han.
 */
export function neighborhoodScopeFilter(
    user: IUser,
    neighborhoodField = "neighborhoodId",
): Record<string, unknown> {
    if (user.roles.includes("admin")) return {};
    const ids = [user.neighborhoodId, ...(user.assignedNeighborhoodIds || [])].filter(
        Boolean,
    );
    if (ids.length === 0) return { _id: { $in: [] } };
    return { [neighborhoodField]: { $in: ids } };
}

/**
 * Xay dung dieu kien Mongo de loc theo Neighborhood thuoc phuong/xa (wardCode)
 * ma nguoi dung (people_committee_official hoac secretary) duoc gan phu trach.
 * filter khac o tren, ham nay PHAI await: User chi luu wardCode (xem User.ts),
 * khong luu san danh sach neighborhoodId, nen can tra Neighborhood.distinct
 * truoc. Chua duoc gan wardCode nghia la KHONG THAY GI (cung quy uoc voi
 * neighborhoodScopeFilter), khong phai xem tat ca.
 */
export async function wardScopeFilter(
    user: IUser,
    neighborhoodField = "neighborhoodId",
): Promise<Record<string, unknown>> {
    if (user.roles.includes("admin")) return {};
    if (!user.wardCode) return { _id: { $in: [] } };
    const neighborhoodIds = await NeighborhoodModel.distinct("_id", {
        wardCode: user.wardCode,
    });
    if (neighborhoodIds.length === 0) return { _id: { $in: [] } };
    return { [neighborhoodField]: { $in: neighborhoodIds } };
}

/**
 * Diem goi chung cho scope theo khu vuc - PHIEN BAN SOFT-CODED: doc
 * Role.scopeType/scopeMechanism/subScopeKinds (xem models/Role.ts) thay vi
 * hardcode theo TEN vai tro, de them/doi mot vai tro "dia ly" (WARD hoac
 * NEIGHBORHOOD) qua man Quan ly vai tro co hieu luc ngay, khong can sua code.
 *
 * QUAN TRONG - day cung la lan DAU TIEN cac vai tro cap PHUONG (secretary/
 * people_committee_official/regional_police, scopeType=WARD) duoc loc theo
 * Phuong/Xa (wardCode) O TAT CA cac module goi ham nay (Complaint/Business/
 * Company/Household/HouseRecord/Report/Pccc/Resident/Request/Announcement...).
 * TRUOC DAY, ham cu (dua hoan toan vao clusterScopeFilter mac dinh - rong =
 * KHONG GIOI HAN) khien 3 vai tro nay THAY TOAN BO du lieu khong gioi han
 * theo Phuong o hau het cac module nay (CHI rieng Appointment la co goi rieng
 * wardScopeFilter them de bu) - day la mot LO HONG PHAN QUYEN duoc phat hien
 * va sua trong lan refactor nay, khong phai thay doi hanh vi ngoai y muon.
 *
 * Cong tac vien (cooperator - vai tro CU, KHONG con Role doc/scope config,
 * khac neighborhood_collaborator) van GIU NGUYEN nhanh rieng nhu truoc (tu
 * choi neu chua duoc gan cluster, cung khong duoc gop vao co che config moi).
 *
 * Neu user giu NHIEU vai tro ASSIGNED cung luc (vd vua to truong vua bi thu -
 * hiem nhung co the xay ra), hop (OR) pham vi cua tung vai tro lai thay vi chi
 * lay mot vai tro. Vai tro dang "Cong tac vien" (co subScopeKinds - scope hep
 * hon NEIGHBORHOOD, xem BR-NB-003) khong dong gop pham vi rong nao ca; neu do
 * la TOAN BO cac vai tro ASSIGNED cua user (khong co vai tro nao khac cho
 * pham vi rong hon), ket qua la tu choi ro (khong lam gi ca), khong roi xuong
 * clusterScopeFilter (quy uoc rong = xem tat ca cua ham do se sai o day).
 */
export async function areaScopeFilter(
    user: IUser,
    opts: { clusterField?: string; neighborhoodField?: string } = {},
): Promise<Record<string, unknown>> {
    if (user.roles.includes("admin")) return {};

    if (
        user.roles.includes(LEGACY_COOPERATOR_ROLE_KEY) &&
        (!user.assignedClusters || user.assignedClusters.length === 0)
    ) {
        return { _id: { $in: [] } };
    }

    const neighborhoodField = opts.neighborhoodField ?? "neighborhoodId";
    const assignedRoles = await RoleModel.find({
        key: { $in: user.roles },
        active: true,
        scopeMechanism: "ASSIGNED",
    });

    if (assignedRoles.length === 0) {
        return clusterScopeFilter(user, opts.clusterField ?? "cluster");
    }

    const grantsBroadNeighborhood = assignedRoles.some(
        r => r.scopeType === "NEIGHBORHOOD" && !r.subScopeKinds,
    );
    const hasWardRole = assignedRoles.some(r => r.scopeType === "WARD");
    const hasDenyOnlyRole = assignedRoles.some(
        r => r.scopeType === "NEIGHBORHOOD" && r.subScopeKinds,
    );

    const orClauses: Record<string, unknown>[] = [];
    if (grantsBroadNeighborhood) {
        orClauses.push(neighborhoodScopeFilter(user, neighborhoodField));
    }
    if (hasWardRole && user.wardCode) {
        const neighborhoodIds = await NeighborhoodModel.distinct("_id", {
            wardCode: user.wardCode,
        });
        if (neighborhoodIds.length > 0) {
            orClauses.push({ [neighborhoodField]: { $in: neighborhoodIds } });
        }
    }

    if (orClauses.length === 1) return orClauses[0];
    if (orClauses.length > 1) return { $or: orClauses };

    if (hasDenyOnlyRole || hasWardRole) {
        return { _id: { $in: [] } };
    }
    return clusterScopeFilter(user, opts.clusterField ?? "cluster");
}
