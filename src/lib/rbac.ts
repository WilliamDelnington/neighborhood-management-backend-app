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
