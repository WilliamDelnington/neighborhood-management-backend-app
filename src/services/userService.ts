import { Role as RoleModel, RoleAssignment, User } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { sanitizeUser } from "@/services/authService";
import type { AssignRoleInput, UpdateUserInput } from "@/validators/user";
import type { Role as RoleType } from "@/types";

export async function listUsers(params: {
    page: number;
    limit: number;
    search?: string;
    role?: RoleType;
}) {
    const filter: Record<string, unknown> = {};
    if (params.role) filter.roles = params.role;
    if (params.search) {
        filter.$or = [
            { displayName: { $regex: params.search, $options: "i" } },
            { phone: { $regex: params.search, $options: "i" } },
        ];
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
 * Danh sach cac to dan pho (neighborhood) hien co, lay tu assignedClusters cua
 * cac tai khoan neighborhood_leader - day la nguon du lieu day du hon
 * Household.distinct("cluster") vi mot to dan pho co the da co to truong duoc
 * gan truoc khi co ho dan nao duoc nhap (xem scripts/create-proposal-accounts.ts).
 */
export async function listNeighborhoods(): Promise<string[]> {
    const clusters = await User.find({
        roles: "neighborhood_leader",
    }).distinct("assignedClusters");
    const collator = new Intl.Collator("vi", { numeric: true });
    return (clusters as unknown as string[]).sort((a, b) => collator.compare(a, b));
}

export async function getUserById(id: string) {
    const user = await User.findById(id);
    if (!user) throw new HttpError("Khong tim thay nguoi dung", 404);
    return await sanitizeUser(user);
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
    if (user.roles.length === 0) user.roles = ["resident"];
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
