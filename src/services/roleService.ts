import { Role, RoleAssignment, User } from "@/models";
import type { IRole } from "@/models/Role";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type { CreateRoleInput, UpdateRoleInput } from "@/validators/role";

/**
 * Dam bao van con it nhat mot user active co quyen quan ly vai tro (permission
 * "roles.manage") SAU KHI thay doi duoc ap dung. Goi truoc khi luu thay doi co
 * the lam mat quyen roles.manage cuoi cung (deactivate/xoa role, go permission
 * roles.manage khoi role). excludeRoleId la role dang duoc sua/xoa - permission
 * cua no khong con hieu luc nen phai loai khoi tap hop "role con lai".
 */
async function assertRoleManagementNotLocked(excludeRoleId?: string): Promise<void> {
    const managingRoles = await Role.find({
        active: true,
        permissions: "roles.manage",
        ...(excludeRoleId ? { _id: { $ne: excludeRoleId } } : {}),
    }).select("key");
    const keys = managingRoles.map(r => r.key);

    const count = await User.countDocuments({
        status: "active",
        $or: [{ roles: { $in: keys } }, { permissions: "roles.manage" }],
    });

    if (count === 0) {
        throw new HttpError(
            "Không thể thực hiện: sẽ không còn ai có quyền quản lý vai trò",
            409,
        );
    }
}

export async function listRoles(params: {
    search?: string;
    active?: boolean;
    page?: number;
    limit?: number;
} = {}) {
    const filter: Record<string, unknown> = {};
    if (params.active !== undefined) filter.active = params.active;
    if (params.search) {
        filter.$or = [
            { key: { $regex: params.search, $options: "i" } },
            { name: { $regex: params.search, $options: "i" } },
        ];
    }
    const page = params.page || 1;
    const limit = params.limit || 20;

    const [roles, total, counts] = await Promise.all([
        Role.find(filter)
            .sort({ sortOrder: 1, name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Role.countDocuments(filter),
        // Dem so nguoi dung theo tung role key tren TOAN BO du lieu (khong
        // theo trang hien tai), vi day la thong ke tong the cua moi role.
        User.aggregate<{ _id: string; count: number }>([
            { $unwind: "$roles" },
            { $group: { _id: "$roles", count: { $sum: 1 } } },
        ]),
    ]);
    const countByKey = new Map(counts.map(c => [c._id, c.count]));

    return {
        items: roles.map(role => ({
            ...role.toObject(),
            assignedUserCount: countByKey.get(role.key) || 0,
        })),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getRoleById(id: string): Promise<IRole> {
    const role = await Role.findById(id);
    if (!role) throw new HttpError("Không tìm thấy vai trò", 404);
    return role;
}

export async function createRole(actorId: string, input: CreateRoleInput) {
    const existing = await Role.findOne({ key: input.key });
    if (existing) throw new HttpError("Key vai trò đã được sử dụng", 409);

    const role = await Role.create({
        ...input,
        system: false,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "role.create",
        targetModel: "Role",
        targetId: role._id,
        metadata: { key: role.key, permissions: role.permissions },
    });

    return role;
}

export async function updateRole(
    actorId: string,
    id: string,
    input: UpdateRoleInput,
) {
    const role = await getRoleById(id);

    const grantsManageNow = role.active && role.permissions.includes("roles.manage");
    const willGrantManage =
        (input.active ?? role.active) &&
        (input.permissions ?? role.permissions).includes("roles.manage");
    if (grantsManageNow && !willGrantManage) {
        await assertRoleManagementNotLocked(String(role._id));
    }

    const permissionsChanged =
        input.permissions !== undefined &&
        JSON.stringify([...input.permissions].sort()) !==
            JSON.stringify([...role.permissions].sort());

    if (input.name !== undefined) role.name = input.name;
    if (input.description !== undefined) role.description = input.description;
    if (input.permissions !== undefined) role.permissions = input.permissions;
    if (input.allowedComplaintCategories !== undefined) {
        role.allowedComplaintCategories =
            input.allowedComplaintCategories === null
                ? undefined
                : input.allowedComplaintCategories;
    }
    if (input.active !== undefined) role.active = input.active;
    if (input.sortOrder !== undefined) role.sortOrder = input.sortOrder;
    role.updatedBy = actorId as any;
    await role.save();

    await writeAuditLog({
        actorId,
        action: permissionsChanged ? "role.permissions.update" : "role.update",
        targetModel: "Role",
        targetId: role._id,
        metadata: { key: role.key, permissions: role.permissions, active: role.active },
    });

    return role;
}

export async function deleteRole(actorId: string, id: string) {
    const role = await getRoleById(id);

    if (role.system) {
        throw new HttpError(
            "Vai trò hệ thống không thể xóa, chỉ có thể vô hiệu hóa",
            409,
        );
    }

    const assignedUserCount = await User.countDocuments({ roles: role.key });
    if (assignedUserCount > 0) {
        throw new HttpError(
            "Vai trò đang được gán cho người dùng, vui lòng chuyển họ sang vai trò khác trước khi xóa",
            409,
        );
    }

    if (role.active && role.permissions.includes("roles.manage")) {
        await assertRoleManagementNotLocked(String(role._id));
    }

    await Role.findByIdAndDelete(id);
    await RoleAssignment.updateMany(
        { role: role.key, revokedAt: { $exists: false } },
        { revokedAt: new Date() },
    );

    await writeAuditLog({
        actorId,
        action: "role.delete",
        targetModel: "Role",
        targetId: id,
        metadata: { key: role.key },
    });

    return { key: role.key };
}
