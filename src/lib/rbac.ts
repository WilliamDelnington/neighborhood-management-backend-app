import { getSessionFromRequest } from "@/lib/auth";
import { HttpError } from "@/lib/response";
import UserModel, { type IUser } from "@/models/User";
import { Role as RoleModel } from "@/models";
import { ensureSystemRoles } from "@/services/roleService";
import type { NhomPhanAnh, Role, SessionTokenPayload } from "@/types";

/**
 * Quyen han duoc luu dong tren Role collection (xem roleService), khong con la
 * bang tinh trong code. Ham nay hop nhat permissions cua tat ca vai tro (active)
 * ma user dang giu.
 */
export async function permissionsForRoles(roles: Role[]): Promise<string[]> {
    if (roles.length === 0) return [];
    await ensureSystemRoles();
    const docs = await RoleModel.find({ key: { $in: roles }, active: true }).select(
        "permissions",
    );
    const set = new Set<string>();
    for (const doc of docs) {
        for (const permission of doc.permissions) set.add(permission);
    }
    return Array.from(set);
}

/**
 * Neu bat ky vai tro active nao cua user khong gioi han nhom phan anh (null), ket
 * qua la khong gioi han. Nguoc lai, hop nhat danh sach gioi han cua tat ca vai tro.
 */
export async function allowedComplaintCategoriesForRoles(
    roles: Role[],
): Promise<NhomPhanAnh[] | null> {
    if (roles.length === 0) return null;
    await ensureSystemRoles();
    const docs = await RoleModel.find({
        key: { $in: roles },
        active: true,
    }).select("allowedComplaintCategories");
    if (docs.length === 0) return null;
    if (docs.some(d => !d.allowedComplaintCategories)) return null;
    const set = new Set<NhomPhanAnh>();
    for (const doc of docs) {
        for (const category of doc.allowedComplaintCategories || []) {
            set.add(category);
        }
    }
    return Array.from(set);
}

export async function roleLabelMap(): Promise<Record<string, string>> {
    await ensureSystemRoles();
    const docs = await RoleModel.find({ active: true }).select("key name");
    const map: Record<string, string> = {};
    for (const doc of docs) map[doc.key] = doc.name;
    return map;
}

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
 * Nem HttpError(403) neu session khong co bat ky role nao trong danh sach cho phep.
 */
export function requireRole(
    session: SessionTokenPayload,
    ...allowed: Role[]
): void {
    const hasRole = session.roles.some(r => allowed.includes(r));
    if (!hasRole) {
        throw new HttpError("Ban khong co quyen thuc hien thao tac nay", 403);
    }
}

/**
 * Nem HttpError(403) neu khong co vai tro active nao cua session mang permission
 * nay (permission duoc quan ly dong qua man hinh Vai tro & phan quyen, xem
 * permissionsForRoles) - dung cho cac thao tac ma quyen han phai theo dung
 * Role collection thay vi danh sach role code cung.
 */
export async function requirePermission(
    session: SessionTokenPayload,
    permission: string,
): Promise<void> {
    const permissions = await permissionsForRoles(session.roles);
    if (!permissions.includes(permission)) {
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
