import { Role, User, type IRole } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { PERMISSION_REGISTRY, SEED_ROLE_PERMISSIONS } from "@/config/permissions";
import { ROLE_LABEL } from "@/types";
import type { CreateRoleInput, UpdateRoleInput } from "@/validators/role";

/**
 * Upsert 6 vai tro he thong (idempotent, $setOnInsert nen khong ghi de chinh sua cua
 * admin). Goi lai moi lan thay vi cache mot lan duy nhat, vi collection Role co the
 * bi xoa trong test (afterEach don du lieu) - tu phuc hoi thay vi dua vao co bien nho.
 */
export async function ensureSystemRoles(): Promise<void> {
    const keys = Object.keys(SEED_ROLE_PERMISSIONS);
    await Role.bulkWrite(
        keys.map((key, index) => ({
            updateOne: {
                filter: { key },
                update: {
                    $setOnInsert: {
                        key,
                        name: ROLE_LABEL[key] || key,
                        permissions: SEED_ROLE_PERMISSIONS[key],
                        system: true,
                        active: true,
                        sortOrder: index,
                        allowedComplaintCategories: null,
                    },
                },
                upsert: true,
            },
        })),
        { ordered: false },
    );
}

function toRecord(role: IRole, assignedUserCount: number) {
    return {
        _id: String(role._id),
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        allowedComplaintCategories: role.allowedComplaintCategories ?? null,
        system: role.system,
        active: role.active,
        sortOrder: role.sortOrder,
        assignedUserCount,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
    };
}

export function getPermissionRegistry() {
    return PERMISSION_REGISTRY;
}

export async function listRoles(params: {
    page: number;
    limit: number;
    search?: string;
    active?: boolean;
}) {
    await ensureSystemRoles();

    const filter: Record<string, unknown> = {};
    if (params.active !== undefined) filter.active = params.active;
    if (params.search) {
        filter.$or = [
            { name: { $regex: params.search, $options: "i" } },
            { key: { $regex: params.search, $options: "i" } },
        ];
    }

    const [roles, total] = await Promise.all([
        Role.find(filter)
            .sort({ sortOrder: 1, name: 1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit),
        Role.countDocuments(filter),
    ]);
    const counts = await Promise.all(
        roles.map(r => User.countDocuments({ roles: r.key })),
    );

    return {
        items: roles.map((r, i) => toRecord(r, counts[i])),
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getRoleById(id: string) {
    await ensureSystemRoles();
    const role = await Role.findById(id);
    if (!role) throw new HttpError("Khong tim thay vai tro", 404);
    const assignedUserCount = await User.countDocuments({ roles: role.key });
    return toRecord(role, assignedUserCount);
}

export async function findActiveRoleByKey(key: string) {
    await ensureSystemRoles();
    return Role.findOne({ key, active: true });
}

export async function createRole(actorId: string, input: CreateRoleInput) {
    await ensureSystemRoles();

    const existing = await Role.findOne({ key: input.key });
    if (existing) throw new HttpError("Key vai tro da ton tai", 409);

    const role = await Role.create({
        key: input.key,
        name: input.name,
        description: input.description,
        permissions: input.permissions,
        allowedComplaintCategories: input.allowedComplaintCategories ?? null,
        active: input.active,
        sortOrder: input.sortOrder,
        system: false,
    });

    await writeAuditLog({
        actorId,
        action: "role.create",
        targetModel: "Role",
        targetId: role._id,
        metadata: { key: role.key },
    });

    return toRecord(role, 0);
}

export async function updateRoleById(
    actorId: string,
    id: string,
    patch: UpdateRoleInput,
) {
    const role = await Role.findById(id);
    if (!role) throw new HttpError("Khong tim thay vai tro", 404);

    if (patch.name !== undefined) role.name = patch.name;
    if (patch.description !== undefined) role.description = patch.description;
    if (patch.permissions !== undefined) role.permissions = patch.permissions;
    if (patch.allowedComplaintCategories !== undefined) {
        role.allowedComplaintCategories = patch.allowedComplaintCategories;
    }
    if (patch.active !== undefined) role.active = patch.active;
    if (patch.sortOrder !== undefined) role.sortOrder = patch.sortOrder;
    await role.save();

    await writeAuditLog({
        actorId,
        action: "role.update",
        targetModel: "Role",
        targetId: role._id,
        metadata: patch,
    });

    const assignedUserCount = await User.countDocuments({ roles: role.key });
    return toRecord(role, assignedUserCount);
}

export async function deleteRoleById(actorId: string, id: string) {
    const role = await Role.findById(id);
    if (!role) throw new HttpError("Khong tim thay vai tro", 404);
    if (role.system) {
        throw new HttpError("Khong the xoa vai tro he thong", 400);
    }

    const assignedUserCount = await User.countDocuments({ roles: role.key });
    if (assignedUserCount > 0) {
        throw new HttpError(
            "Vai tro dang duoc gan cho nguoi dung, khong the xoa",
            400,
        );
    }

    await role.deleteOne();

    await writeAuditLog({
        actorId,
        action: "role.delete",
        targetModel: "Role",
        targetId: id,
        metadata: { key: role.key },
    });

    return { key: role.key };
}
