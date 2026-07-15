import { getSessionFromRequest } from "@/lib/auth";
import { HttpError } from "@/lib/response";
import UserModel, { type IUser } from "@/models/User";
import RoleModel from "@/models/Role";
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

/**
 * Tai ve document User day du (can cho scope filtering: assignedClusters, householdId...).
 * Nem HttpError(401) neu tai khoan khong con ton tai hoac bi khoa.
 */
export async function requireUser(req: Request): Promise<IUser> {
    const session = requireSession(req);
    const user = await UserModel.findById(session.userId);
    if (!user || user.status === "locked") {
        throw new HttpError("Tai khoan khong hop le hoac da bi khoa", 401);
    }
    if (user.sessionVersion !== session.sv) {
        throw new HttpError(
            "Phien dang nhap da het hieu luc, vui long dang nhap lai",
            401,
        );
    }
    return user;
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
