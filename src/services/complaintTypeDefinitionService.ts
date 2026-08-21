import {
    Complaint,
    ComplaintTypeDefinition,
    Role,
    type IComplaintTypeDefinition,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateComplaintTypeDefinitionInput,
    UpdateComplaintTypeDefinitionInput,
} from "@/validators/complaintTypeDefinition";

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

function assertDefinitionInScope(
    actorUser: IUser,
    definition: IComplaintTypeDefinition,
) {
    if (actorUser.roles.includes("admin")) return;
    if (!actorUser.wardCode || definition.wardCode !== actorUser.wardCode) {
        throw new HttpError("Loại phản ánh không thuộc phường/xã bạn phụ trách", 403);
    }
}

export async function listComplaintTypeDefinitions(params: {
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
        ComplaintTypeDefinition.find(filter)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        ComplaintTypeDefinition.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function createComplaintTypeDefinition(
    actorUser: IUser,
    input: CreateComplaintTypeDefinitionInput,
) {
    const key = input.key.trim().toLowerCase();
    if (await ComplaintTypeDefinition.exists({ key })) {
        throw new HttpError("Mã loại phản ánh đã tồn tại", 409);
    }
    await assertRoleKeysExist(input.allowedReceiverRoles);

    const definition = await ComplaintTypeDefinition.create({
        ...input,
        key,
        isBuiltIn: false,
        wardCode: actorUser.wardCode,
        wardName: actorUser.wardName,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "complaint_type.create",
        targetModel: "ComplaintTypeDefinition",
        targetId: definition._id,
        metadata: { key },
    });
    return definition;
}

export async function updateComplaintTypeDefinition(
    actorUser: IUser,
    id: string,
    input: UpdateComplaintTypeDefinitionInput,
) {
    const definition = await ComplaintTypeDefinition.findById(id);
    if (!definition) throw new HttpError("Không tìm thấy loại phản ánh", 404);
    assertDefinitionInScope(actorUser, definition);
    if (input.allowedReceiverRoles) {
        await assertRoleKeysExist(input.allowedReceiverRoles);
    }

    // updateComplaintTypeDefinitionSchema da bo truong `key` (omit), nen loai
    // isBuiltIn:true chi co the bi sua name/description/allowedReceiverRoles/
    // active qua day - khong co duong nao khac de doi key/xoa ban ghi.
    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
            (definition as unknown as Record<string, unknown>)[key] = value;
        }
    }
    definition.updatedBy = actorUser._id as any;
    await definition.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "complaint_type.update",
        targetModel: "ComplaintTypeDefinition",
        targetId: definition._id,
        metadata: { key: definition.key, active: definition.active },
    });
    return definition;
}

export async function archiveComplaintTypeDefinition(
    actorUser: IUser,
    id: string,
) {
    const definition = await ComplaintTypeDefinition.findById(id);
    if (!definition) throw new HttpError("Không tìm thấy loại phản ánh", 404);
    assertDefinitionInScope(actorUser, definition);
    if (definition.isBuiltIn) {
        throw new HttpError(
            "Không thể ngừng sử dụng loại phản ánh hệ thống (isBuiltIn)",
            409,
        );
    }
    definition.active = false;
    definition.updatedBy = actorUser._id as any;
    await definition.save();
    const usageCount = await Complaint.countDocuments({ category: definition.key });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "complaint_type.archive",
        targetModel: "ComplaintTypeDefinition",
        targetId: definition._id,
        metadata: { key: definition.key, usageCount },
    });
    return definition;
}

/**
 * Tra ve dinh nghia loai phan anh theo key, khong loc theo pham vi/trang thai -
 * dung boi createComplaint de xac dinh cach dieu huong nguoi nhan
 * (resolveComplaintTypeRecipientIds). Tra ve null neu chua co (vd danh muc
 * chua duoc seed trong giai doan migrate) de noi goi tu roi ve hanh vi cu thay
 * vi bao loi.
 */
export async function getComplaintTypeByKey(
    key: string,
): Promise<IComplaintTypeDefinition | null> {
    return ComplaintTypeDefinition.findOne({ key });
}

export function complaintTypeLabel(
    key: string,
    definition?: IComplaintTypeDefinition | null,
) {
    return definition?.name || key;
}
