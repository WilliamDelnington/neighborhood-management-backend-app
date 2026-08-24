import {
    Request as RequestModel,
    RequestTypeDefinition,
    Role,
    type IRequestTypeDefinition,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { REQUEST_TYPES, REQUEST_TYPE_LABEL } from "@/types";
import type {
    CreateRequestTypeDefinitionInput,
    UpdateRequestTypeDefinitionInput,
} from "@/validators/requestTypeDefinition";

const BUILT_IN_KEYS = new Set<string>(REQUEST_TYPES);

async function assertRoleKeysExist(roleKeys: string[]) {
    const unique = [...new Set(roleKeys)];
    const count = await Role.countDocuments({ key: { $in: unique }, active: true });
    if (count !== unique.length) {
        throw new HttpError("Danh sách vai trò có giá trị không tồn tại/đã khóa", 422);
    }
}

function definitionScope(actorUser: IUser): Record<string, unknown> {
    if (actorUser.roles.includes("admin")) return {};
    if (!actorUser.wardCode) return { _id: { $in: [] } };
    return { wardCode: actorUser.wardCode };
}

function assertDefinitionInScope(actorUser: IUser, definition: IRequestTypeDefinition) {
    if (actorUser.roles.includes("admin")) return;
    if (!actorUser.wardCode || definition.wardCode !== actorUser.wardCode) {
        throw new HttpError("Loại nhiệm vụ không thuộc phường/xã bạn phụ trách", 403);
    }
}

export async function listRequestTypeDefinitions(params: {
    actorUser: IUser;
    active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
}) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const filter: Record<string, unknown> = definitionScope(params.actorUser);
    if (params.active !== undefined) filter.active = params.active;
    if (params.search) {
        filter.$or = [
            { key: { $regex: params.search, $options: "i" } },
            { name: { $regex: params.search, $options: "i" } },
        ];
    }

    const [items, total] = await Promise.all([
        RequestTypeDefinition.find(filter)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        RequestTypeDefinition.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function createRequestTypeDefinition(
    actorUser: IUser,
    input: CreateRequestTypeDefinitionInput,
) {
    const key = input.key.trim().toLowerCase();
    if (BUILT_IN_KEYS.has(key)) {
        throw new HttpError("Mã này đã được sử dụng bởi loại nhiệm vụ hệ thống", 409);
    }
    if (await RequestTypeDefinition.exists({ key })) {
        throw new HttpError("Mã loại nhiệm vụ đã tồn tại", 409);
    }
    await assertRoleKeysExist([
        ...input.allowedSenderRoles,
        ...input.allowedReceiverRoles,
    ]);

    const definition = await RequestTypeDefinition.create({
        ...input,
        key,
        wardCode: actorUser.wardCode,
        wardName: actorUser.wardName,
        version: 1,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "request_type.create",
        targetModel: "RequestTypeDefinition",
        targetId: definition._id,
        metadata: { key, version: 1 },
    });
    return definition;
}

export async function updateRequestTypeDefinition(
    actorUser: IUser,
    id: string,
    input: UpdateRequestTypeDefinitionInput,
) {
    const definition = await RequestTypeDefinition.findById(id);
    if (!definition) throw new HttpError("Không tìm thấy loại nhiệm vụ", 404);
    assertDefinitionInScope(actorUser, definition);
    if (input.allowedSenderRoles || input.allowedReceiverRoles) {
        await assertRoleKeysExist([
            ...(input.allowedSenderRoles || definition.allowedSenderRoles),
            ...(input.allowedReceiverRoles || definition.allowedReceiverRoles),
        ]);
    }

    const fieldsChanged = input.fields !== undefined;
    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
            (definition as unknown as Record<string, unknown>)[key] = value;
        }
    }
    if (fieldsChanged) definition.version += 1;
    definition.updatedBy = actorUser._id as any;
    await definition.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "request_type.update",
        targetModel: "RequestTypeDefinition",
        targetId: definition._id,
        metadata: {
            key: definition.key,
            version: definition.version,
            active: definition.active,
        },
    });
    return definition;
}

export async function archiveRequestTypeDefinition(actorUser: IUser, id: string) {
    const definition = await RequestTypeDefinition.findById(id);
    if (!definition) throw new HttpError("Không tìm thấy loại nhiệm vụ", 404);
    assertDefinitionInScope(actorUser, definition);
    definition.active = false;
    definition.updatedBy = actorUser._id as any;
    await definition.save();
    const usageCount = await RequestModel.countDocuments({ typeDefinitionId: id });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "request_type.archive",
        targetModel: "RequestTypeDefinition",
        targetId: definition._id,
        metadata: { key: definition.key, usageCount },
    });
    return definition;
}

export async function findRequestTypeForActor(actorUser: IUser, key: string) {
    if (BUILT_IN_KEYS.has(key)) return null;
    const definition = await RequestTypeDefinition.findOne({ key, active: true });
    if (!definition) throw new HttpError("Loại nhiệm vụ không tồn tại/đã khóa", 422);
    assertDefinitionInScope(actorUser, definition);
    return definition;
}

export async function getAvailableRequestTypes(actorUser: IUser) {
    const customs = await RequestTypeDefinition.find({
        ...definitionScope(actorUser),
        active: true,
        allowedSenderRoles: { $in: actorUser.roles },
    }).sort({ name: 1 });

    return [
        ...REQUEST_TYPES.map(key => ({
            key,
            name: REQUEST_TYPE_LABEL[key] || key,
            builtIn: true as const,
            fields: [],
            dataEntryMode: "sender" as const,
            version: 1,
        })),
        ...customs.map(item => ({
            _id: item._id,
            key: item.key,
            name: item.name,
            description: item.description,
            builtIn: false as const,
            fields: item.fields,
            dataEntryMode: item.dataEntryMode,
            version: item.version,
            allowedReceiverRoles: item.allowedReceiverRoles,
        })),
    ];
}

export function requestTypeLabel(
    key: string,
    definition?: IRequestTypeDefinition | null,
) {
    return definition?.name || REQUEST_TYPE_LABEL[key] || key;
}
