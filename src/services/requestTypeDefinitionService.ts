import {
    Request as RequestModel,
    RequestTypeDefinition,
    Role,
    type IRequestTypeDefinition,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { REQUEST_TYPE_LABEL } from "@/types";
import type {
    CreateRequestTypeDefinitionInput,
    UpdateRequestTypeDefinitionInput,
} from "@/validators/requestTypeDefinition";

async function assertRoleKeysExist(roleKeys: string[]) {
    const unique = [...new Set(roleKeys)];
    const count = await Role.countDocuments({ key: { $in: unique }, active: true });
    if (count !== unique.length) {
        throw new HttpError("Danh sách vai trò có giá trị không tồn tại/đã khóa", 422);
    }
}

/**
 * Loai nhiem vu isBuiltIn=true (seed san, khong gan wardCode - xem
 * scripts/seed-request-types.ts) phai luon hien voi MOI actor, ke ca nguoi
 * khong co wardCode - giong dung ly do/loi da gap voi
 * ComplaintTypeDefinition.definitionScope (xem ghi chu o do): dieu kien
 * {wardCode: actorUser.wardCode} loai bo ca isBuiltIn (wardCode undefined !=
 * actorUser.wardCode), va !actorUser.wardCode tra ve rong hoan toan.
 */
function definitionScope(actorUser: IUser): Record<string, unknown> {
    if (actorUser.roles.includes("admin")) return {};
    if (!actorUser.wardCode) return { isBuiltIn: true };
    return { $or: [{ isBuiltIn: true }, { wardCode: actorUser.wardCode }] };
}

// Dung cho CA HAI muc dich khac nhau: (1) quan ly (sua/khoa dinh nghia - luon
// yeu cau wardCode khop, KE CA voi vai tro nam trong allowedSenderRoles cua no
// - mot nguoi duoc PHEP GUI mot loai khong dong nghia duoc phep SUA dinh nghia
// do), va (2) fallback pham vi cho nguoi gui KHONG duoc CHOT RO rieng trong
// allowedSenderRoles (xem findRequestTypeForActor - noi da tu bo qua ham nay
// khi allowedSenderRoles da chot ro, TRUOC KHI goi ham nay).
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
    // Ket hop bang $and (khong gan truc tiep vao filter.$or) - definitionScope
    // co the tra ve chinh mot dieu kien $or (isBuiltIn/wardCode), neu gan de
    // "filter.$or = [...tim kiem]" ben duoi se de ghi de mat scope.
    const conditions: Record<string, unknown>[] = [
        definitionScope(params.actorUser),
    ];
    if (params.active !== undefined) conditions.push({ active: params.active });
    if (params.search) {
        conditions.push({
            $or: [
                { key: { $regex: params.search, $options: "i" } },
                { name: { $regex: params.search, $options: "i" } },
            ],
        });
    }
    const filter: Record<string, unknown> = { $and: conditions };

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
    const definition = await RequestTypeDefinition.findOne({ key, active: true });
    if (!definition) throw new HttpError("Loại nhiệm vụ không tồn tại/đã khóa", 422);
    // Loai isBuiltIn (seed san, khong gan wardCode) phai dung duoc boi MOI
    // nguoi gui hop le (kiem tra allowedSenderRoles rieng o createRequest) -
    // assertDefinitionInScope se 403 sai neu ap dung cho built-in, vi
    // definition.wardCode luon la undefined, khong khop wardCode cua bat ky
    // actor khong phai admin nao.
    //
    // Tuong tu, mot vai tro da duoc admin CHOT RO trong allowedSenderRoles cua
    // CHINH dinh nghia nay la DU dieu kien gui, bat ke wardCode - wardCode chi
    // la pham vi cua secretary/people_committee_official (xem User.ts),
    // neighborhood_leader/neighborhood_coleader (pham vi TDP qua neighborhoodId)
    // KHONG BAO GIO co wardCode nen se bi assertDefinitionInScope 403 SAI o day
    // du da duoc chot ro - loi thuc te phat hien 2026-09-15 (Tổ trưởng khong
    // gui duoc "Kiểm tra tình hình" du da duoc them vao allowedSenderRoles).
    const explicitlyAuthorizedSender = definition.allowedSenderRoles.some(role =>
        actorUser.roles.includes(role),
    );
    if (!definition.isBuiltIn && !explicitlyAuthorizedSender) {
        assertDefinitionInScope(actorUser, definition);
    }
    return definition;
}

export async function getAvailableRequestTypes(actorUser: IUser) {
    const isAdmin = actorUser.roles.includes("admin");
    // Ket hop bang $and (khong gan truc tiep vao filter.$or) - tranh 2 khoa
    // filter.$or de ghi de len nhau, giong luu y trong listRequestTypeDefinitions.
    const conditions: Record<string, unknown>[] = [{ active: true }];
    if (!isAdmin) {
        // definitionScope (isBuiltIn/wardCode) la dieu kien "duyet chung" theo
        // pham vi dia ly - NHUNG mot vai tro da duoc admin CHOT RO trong
        // allowedSenderRoles cua chinh dinh nghia la DU dieu kien gui roi, nen
        // phai la MOT NHANH THAY THE (OR) dung lap voi definitionScope, khong
        // phai dieu kien BAT BUOC THEM (AND). Neu bat buoc ca hai, loai tu tao
        // co wardCode se KHONG BAO GIO hien voi neighborhood_leader/
        // neighborhood_coleader du da duoc chot ro, vi 2 vai tro nay dung
        // neighborhoodId lam pham vi (khong bao gio co wardCode - xem User.ts,
        // wardCode CHI la pham vi cua secretary/people_committee_official) -
        // loi thuc te phat hien 2026-09-15 (Tổ trưởng khong thay "Kiểm tra
        // tình hình" du da duoc them vao allowedSenderRoles). isBuiltIn van
        // luon hien vi no la mot nhanh cua chinh definitionScope.
        conditions.push({
            $or: [
                definitionScope(actorUser),
                { allowedSenderRoles: { $in: actorUser.roles } },
            ],
        });
    }
    const items = await RequestTypeDefinition.find({ $and: conditions }).sort({
        name: 1,
    });

    return items.map(item => ({
        _id: item._id,
        key: item.key,
        name: item.name,
        description: item.description,
        builtIn: item.isBuiltIn,
        fields: item.fields,
        dataEntryMode: item.dataEntryMode,
        version: item.version,
        allowedReceiverRoles: item.allowedReceiverRoles,
    }));
}

export function requestTypeLabel(
    key: string,
    definition?: IRequestTypeDefinition | null,
) {
    return definition?.name || REQUEST_TYPE_LABEL[key] || key;
}
