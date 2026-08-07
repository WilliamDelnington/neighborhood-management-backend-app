import {
    HouseRecord,
    Role as RoleModel,
    RoleAssignment,
    User,
    type IUser,
} from "@/models";
import type { Types } from "mongoose";
import { HttpError } from "@/lib/response";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/services/auditService";
import { sanitizeUser } from "@/services/authService";
import { getActingOwnerUserIdsForHouses } from "@/services/houseOwnershipService";
import type {
    AssignRoleInput,
    CreateHouseOwnerInput,
    LockUserStatusInput,
    UpdateUserInput,
} from "@/validators/user";
import type { Role as RoleType } from "@/types";

/**
 * Danh sach userId cua cac house_owner dang thao tac thay chu (primary_owner/
 * co_owner/authorized_manager, da resolve to chuc) tren bat ky Nha so nao
 * thuoc to dan pho actorUser phu trach (neighborhoodId/assignedNeighborhoodIds)
 * - day la toan bo pham vi "tai khoan" ma mot to truong duoc phep thay/xem
 * (users.read/users.lock KHONG con la quyen khong gioi han nhu users.update -
 * xem systemRoles.ts). Rong neu actorUser chua duoc phan cong to dan pho nao.
 */
async function getHouseOwnerIdsInLeaderScope(
    actorUser: IUser,
): Promise<Types.ObjectId[]> {
    const allowedNeighborhoodIds = [
        actorUser.neighborhoodId,
        ...(actorUser.assignedNeighborhoodIds || []),
    ]
        .filter(Boolean)
        .map(String);
    if (allowedNeighborhoodIds.length === 0) return [];

    const houseIds = await HouseRecord.find({
        neighborhoodId: { $in: allowedNeighborhoodIds },
    }).distinct("_id");
    return getActingOwnerUserIdsForHouses(houseIds);
}

/**
 * Danh sach nguoi dung. Admin xem toan bo he thong (khong gioi han) - cac vai
 * tro khac (hien tai chi neighborhood_leader co users.read) CHI xem duoc tai
 * khoan house_owner dang so huu nha thuoc to dan pho minh phu trach (xem
 * getHouseOwnerIdsInLeaderScope) - khong duoc xem tai khoan cua nhan vien/
 * admin khac du co goi voi bo loc role nao. Tranh lo toan bo danh sach nguoi
 * dung he thong nhu truoc khi co scope nay.
 */
export async function listUsers(params: {
    page: number;
    limit: number;
    search?: string;
    role?: RoleType;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = {};
    if (params.role) filter.roles = params.role;
    if (params.search) {
        filter.$or = [
            { displayName: { $regex: params.search, $options: "i" } },
            { phone: { $regex: params.search, $options: "i" } },
        ];
    }
    if (!params.actorUser.roles.includes("admin")) {
        const scopedIds = await getHouseOwnerIdsInLeaderScope(params.actorUser);
        filter._id = { $in: scopedIds };
        filter.roles = "house_owner";
    }
    const [items, total] = await Promise.all([
        User.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        User.countDocuments(filter),
    ]);
    return {
        items: await Promise.all(items.map(sanitizeUser)),
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

/**
 * Danh sach rut gon (chi id + displayName) cac nhan vien co bat ky role nao trong
 * danh sach truyen vao - dung cho cac man hinh chon nguoi phu trach (vd. gan phu
 * trach phan anh) ma KHONG can quyen quan ly nguoi dung day du (/api/users la admin-only).
 */
export async function listAssignableStaff(roles: RoleType[]) {
    const users = await User.find({ roles: { $in: roles }, status: "active" })
        .select("displayName")
        .sort({ displayName: 1 });
    return users.map(u => ({ id: String(u._id), displayName: u.displayName }));
}

/**
 * To truong (hoac admin) tao tai khoan chu ho thay, dat san so dien thoai +
 * mat khau ban dau - cung logic tao User voi authService.registerWithPhone
 * (tu dang ky), chi khac actor va co ghi nhan createdBy. Chu ho dang nhap
 * bang chinh so dien thoai/mat khau nay (xem authService.loginWithPhone).
 */
export async function createHouseOwnerByStaff(
    actorUser: IUser,
    input: CreateHouseOwnerInput,
) {
    const existing = await User.findOne({ phone: input.phone });
    if (existing) {
        throw new HttpError("So dien thoai da duoc su dung", 409);
    }

    const passwordHash = await hashPassword(input.password);
    let user: IUser;
    try {
        user = await User.create({
            phone: input.phone,
            passwordHash,
            displayName: input.displayName,
            address: input.address,
            roles: ["house_owner"],
            primaryRole: "house_owner",
            status: "active",
            createdBy: actorUser._id,
        });
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError("So dien thoai da duoc su dung", 409);
        }
        throw err;
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "user.create_house_owner",
        targetModel: "User",
        targetId: user._id,
    });

    return sanitizeUser(user);
}

/**
 * Xem chi tiet mot nguoi dung. Admin xem duoc bat ky ai - cac vai tro khac chi
 * xem duoc neu targetId nam trong pham vi cua actorUser (xem
 * getHouseOwnerIdsInLeaderScope/assertUserInLeaderScope), cung mot quy tac voi
 * listUsers.
 */
export async function getUserById(actorUser: IUser, id: string) {
    const user = await User.findById(id);
    if (!user) throw new HttpError("Khong tim thay nguoi dung", 404);
    if (!actorUser.roles.includes("admin")) {
        await assertUserInLeaderScope(actorUser, user);
    }
    return await sanitizeUser(user);
}

/**
 * Nem HttpError(403) neu actorUser (to truong) khong duoc phep xem/khoa tai
 * khoan targetUser: targetUser phai la house_owner VA dang thao tac thay chu
 * tren it nhat mot Nha so thuoc to dan pho actorUser phu trach (xem
 * getHouseOwnerIdsInLeaderScope). Dung chung cho getUserById va lockUserStatus
 * khi actor khong phai admin - day la quyen HEP hon users.update (khong cho
 * actor sua bat ky truong nao khac cua targetUser ngoai status - xem
 * users.lock trong systemRoles.ts).
 */
async function assertUserInLeaderScope(
    actorUser: IUser,
    targetUser: IUser,
): Promise<void> {
    if (!targetUser.roles.includes("house_owner")) {
        throw new HttpError(
            "Tổ trưởng chỉ được xem/khóa tài khoản chủ nhà",
            403,
        );
    }
    const scopedIds = await getHouseOwnerIdsInLeaderScope(actorUser);
    const inScope = scopedIds.some(
        id => String(id) === String(targetUser._id),
    );
    if (!inScope) {
        throw new HttpError(
            "Chủ nhà này không thuộc tổ dân phố bạn phụ trách",
            403,
        );
    }
}

/**
 * Khoa/mo tai khoan chu nha - dung cho ca admin (users.update, khong gioi han)
 * lan to truong (users.lock, gioi han qua assertUserInLeaderScope). Ly do bat
 * buoc (xem lockUserStatusSchema) va luon duoc ghi vao audit log cung voi
 * status moi.
 */
export async function lockUserStatus(
    actorUser: IUser,
    targetId: string,
    input: LockUserStatusInput,
) {
    const target = await User.findById(targetId);
    if (!target) throw new HttpError("Khong tim thay nguoi dung", 404);

    if (!actorUser.roles.includes("admin")) {
        await assertUserInLeaderScope(actorUser, target);
    }

    const statusChanged = target.status !== input.status;
    target.status = input.status;
    target.updatedBy = actorUser._id as any;
    if (statusChanged && input.status === "locked") {
        target.sessionVersion += 1;
    }
    await target.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "user.update",
        targetModel: "User",
        targetId: target._id,
        metadata: { status: input.status, statusReason: input.statusReason },
    });

    return await sanitizeUser(target);
}

export async function updateUserByAdmin(
    actorId: string,
    targetId: string,
    patch: UpdateUserInput,
) {
    const user = await User.findById(targetId);
    if (!user) throw new HttpError("Khong tim thay nguoi dung", 404);

    const statusChanged =
        patch.status !== undefined && patch.status !== user.status;

    if (patch.displayName !== undefined) user.displayName = patch.displayName;
    if (patch.phone !== undefined) user.phone = patch.phone;
    if (patch.status !== undefined) user.status = patch.status;
    if (patch.householdId !== undefined) {
        user.householdId = (patch.householdId as any) || undefined;
    }
    if (patch.citizenId !== undefined) {
        user.citizenId = (patch.citizenId as any) || undefined;
    }
    if (patch.assignedClusters !== undefined)
        user.assignedClusters = patch.assignedClusters;
    if (patch.primaryRole !== undefined) {
        if (!user.roles.includes(patch.primaryRole)) {
            throw new HttpError(
                "Vai tro chinh phai la mot trong cac vai tro hien co cua nguoi dung",
                422,
            );
        }
        user.primaryRole = patch.primaryRole;
    }
    user.updatedBy = actorId as any;

    if (statusChanged && patch.status === "locked") {
        user.sessionVersion += 1;
    }

    try {
        await user.save();
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError("So dien thoai da duoc su dung", 409);
        }
        throw err;
    }

    await writeAuditLog({
        actorId,
        action: "user.update",
        targetModel: "User",
        targetId,
        metadata: patch,
    });

    return await sanitizeUser(user);
}

export async function assignRole(actorId: string, input: AssignRoleInput) {
    const user = await User.findById(input.userId);
    if (!user) throw new HttpError("Khong tim thay nguoi dung", 404);

    // Truoc day enum Mongoose tren User.roles dam bao role hop le - gio vai tro
    // la du lieu dong nen phai kiem tra ton tai + active tai day.
    const role = await RoleModel.findOne({ key: input.role });
    if (!role || !role.active) {
        throw new HttpError("Vai tro khong ton tai hoac da bi vo hieu hoa", 422);
    }

    if (!user.roles.includes(input.role)) {
        user.roles.push(input.role);
    }
    user.sessionVersion += 1;
    await user.save();

    const assignment = await RoleAssignment.create({
        userId: user._id,
        role: input.role,
        scopeType: input.scopeType,
        scopeValues: input.scopeValues,
        grantedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "role.assign",
        targetModel: "User",
        targetId: user._id,
        metadata: { role: input.role, scopeType: input.scopeType },
    });

    return { user: await sanitizeUser(user), assignment };
}

export async function revokeRole(
    actorId: string,
    userId: string,
    role: RoleType,
) {
    const user = await User.findById(userId);
    if (!user) throw new HttpError("Khong tim thay nguoi dung", 404);

    user.roles = user.roles.filter(r => r !== role);
    if (user.roles.length === 0) user.roles = ["house_owner"];
    if (user.primaryRole === role) user.primaryRole = user.roles[0];
    user.sessionVersion += 1;
    await user.save();

    await RoleAssignment.updateMany(
        { userId, role, revokedAt: { $exists: false } },
        { revokedAt: new Date() },
    );

    await writeAuditLog({
        actorId,
        action: "role.revoke",
        targetModel: "User",
        targetId: userId,
        metadata: { role },
    });

    return await sanitizeUser(user);
}
