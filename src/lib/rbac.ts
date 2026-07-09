import { getSessionFromRequest } from "@/lib/auth";
import { HttpError } from "@/lib/response";
import UserModel, { type IUser } from "@/models/User";
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
