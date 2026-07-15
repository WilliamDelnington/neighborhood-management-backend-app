import { Role, RoleAssignment, User } from "@/models";
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

    if (patch.primaryRole !== undefined && patch.primaryRole !== user.primaryRole) {
        if (!user.roles.includes(patch.primaryRole)) {
            throw new HttpError(
                "Nguoi dung chua co vai tro nay, khong the dat lam vai tro chinh",
                400,
            );
        }
        user.primaryRole = patch.primaryRole;
        user.sessionVersion += 1;
    }

    user.updatedBy = actorId as any;

    if (statusChanged && patch.status === "locked") {
        user.sessionVersion += 1;
    }

    await user.save();

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

    const role = await Role.findOne({ key: input.role, active: true });
    if (!role) {
        throw new HttpError("Vai tro khong ton tai hoac da bi vo hieu hoa", 404);
    }

    if (!user.roles.includes(input.role)) {
        user.roles.push(input.role);
    }
    user.primaryRole = input.role;
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
