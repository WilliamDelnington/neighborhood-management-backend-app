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

// Danh muc khong gan wardCode (isBuiltIn seed san - xem
// scripts/seed-complaint-types.ts - HOAC admin he thong tu tao qua
// createComplaintTypeDefinition khi actorUser khong co wardCode) la danh muc
// TOAN CUC, phai hien voi MOI actor bat ke wardCode cua ho. Dung wardCode
// $exists:false thay vi isBuiltIn:true de bao gom ca 2 truong hop, neu khong
// loai phan anh moi do admin he thong tao se khong co wardCode nhung van bi
// loai khoi scope (isBuiltIn luon la false voi danh muc do), khien khong cong
// dan/can bo nao thay duoc no du da active.
const GLOBAL_DEFINITION_SCOPE = { wardCode: { $exists: false } };

/**
 * Truoc day dieu kien {wardCode: actorUser.wardCode} loai bo ca danh muc toan
 * cuc (vi wardCode undefined != actorUser.wardCode), va !actorUser.wardCode
 * tra ve rong hoan toan, khien cong dan khong chon duoc loai phan anh nao (xem
 * ComplaintCreatePage.tsx).
 */
function definitionScope(actorUser: IUser): Record<string, unknown> {
    if (actorUser.roles.includes("admin")) return {};
    if (!actorUser.wardCode) return GLOBAL_DEFINITION_SCOPE;
    return {
        $or: [GLOBAL_DEFINITION_SCOPE, { wardCode: actorUser.wardCode }],
    };
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
    // Ket hop bang $and (khong gan truc tiep vao filter.$or) - definitionScope
    // co the tra ve chinh mot dieu kien $or (isBuiltIn/wardCode), neu gan de
    // "filter.$or = [...tim kiem]" ben duoi se de ghi de mat scope.
    const conditions: Record<string, unknown>[] = [definitionScope(params.actorUser)];
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
    await assertRoleKeysExist(input.allowedSenderRoles);

    // Chi gan wardCode/wardName khi actor (bi thu/can bo UBND) thuc su thuoc
    // mot phuong/xa cu the - danh muc cua ho chi danh cho phuong do. Admin he
    // thong (khong co wardCode) tao danh muc TOAN CUC (xem
    // GLOBAL_DEFINITION_SCOPE o definitionScope) - khong duoc gan wardCode:
    // undefined mot cach tuong minh, mongoose van luu field do (= khong con la
    // "khong ton tai" nua) khien $exists:false khong con khop.
    const definition = await ComplaintTypeDefinition.create({
        ...input,
        key,
        isBuiltIn: false,
        ...(actorUser.wardCode
            ? { wardCode: actorUser.wardCode, wardName: actorUser.wardName }
            : {}),
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
    if (input.allowedSenderRoles) {
        await assertRoleKeysExist(input.allowedSenderRoles);
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

/**
 * Ngung dung (active=false) - hoat dong tren CA danh muc isBuiltIn: isBuiltIn
 * chi khoa key/xoa ban ghi that su (xem model), khong nen chan viec tat active
 * - da tung chan ca isBuiltIn khien phan lon danh muc seed san (chiem da so
 * du lieu dev) khong the "go" duoc khoi danh sach chon cua nguoi dung. Danh
 * muc isBuiltIn khong gan wardCode nen chi actorUser co role "admin" moi qua
 * duoc assertDefinitionInScope o tren - ward-tier (bi thu/UBND) van khong tat
 * duoc danh muc toan cuc, chi tat duoc danh muc cua chinh phuong minh.
 */
export async function archiveComplaintTypeDefinition(
    actorUser: IUser,
    id: string,
) {
    const definition = await ComplaintTypeDefinition.findById(id);
    if (!definition) throw new HttpError("Không tìm thấy loại phản ánh", 404);
    assertDefinitionInScope(actorUser, definition);
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

// 4 vai tro cu dan (nguoi duy nhat duoc gui phan anh truoc khi co tinh nang
// To truong/To pho gui de xuat len Phuong) - dung de phan biet danh muc "cho
// cu dan" voi danh muc "chi danh cho nhan vien" (xem
// getStaffOnlyComplaintCategoryKeys ben duoi).
const CITIZEN_COMPLAINT_SENDER_ROLES = [
    "house_owner",
    "household_head",
    "business_representative",
    "company_representative",
];

/**
 * Danh sach key cac danh muc phan anh CHI danh cho nhan vien gui (vd To
 * truong/To pho gui de xuat len Phuong: "to_de_xuat_len_phuong") - la danh
 * muc co allowedSenderRoles khong giao voi CITIZEN_COMPLAINT_SENDER_ROLES.
 * Dung de:
 *   - An can bo cap Phuong danh sach phan anh cua cu dan (ho chi duoc xem
 *     phan anh do To truong/To pho GUI LEN, khong phai toan bo phan anh trong
 *     dia ban - xem complaintScopeFilter).
 *   - Tach rieng tab "Da gui" khoi "Nhan tu cu dan" cho To truong/To pho
 *     (xem listComplaints).
 * Danh muc CHUA co ComplaintTypeDefinition (legacy/dang migrate) luon duoc
 * coi la "cho cu dan" (khong nam trong danh sach nay) - giu nguyen hanh vi cu.
 */
export async function getStaffOnlyComplaintCategoryKeys(): Promise<string[]> {
    const definitions = await ComplaintTypeDefinition.find({
        active: true,
    }).select("key allowedSenderRoles");
    return definitions
        .filter(
            d =>
                (d.allowedSenderRoles || []).length > 0 &&
                !d.allowedSenderRoles.some(role =>
                    CITIZEN_COMPLAINT_SENDER_ROLES.includes(role),
                ),
        )
        .map(d => d.key);
}

/**
 * Danh sach key cac danh muc phan anh ma actor (theo vai tro) la nguoi NHAN
 * (xuat hien trong allowedReceiverRoles cua danh muc active tuong ung) - vd
 * regional_police -> [an_ninh_trat_tu, pccc], environment_officer ->
 * [ve_sinh_moi_truong], secretary/people_committee_official ->
 * [to_de_xuat_len_phuong]. Dung boi listComplaints de loc danh sach cho cac
 * vai tro cap Phuong (WARD/ASSIGNED) THEO DUNG danh muc ho phu trach thay vi
 * dung chung mot bo loc "chi danh cho nhan vien" (xem
 * getStaffOnlyComplaintCategoryKeys) cho MOI vai tro cap Phuong - nham lan
 * truoc gop ca cac vai tro "phong ban" chuyen mon (police/moi truong) vao
 * chung nhanh do, khien ho khong con thay duoc phan anh cua CU DAN gui truc
 * tiep cho minh (vd an_ninh_trat_tu) sau khi duoc gan Phuong/Xa.
 */
export async function getReceivableComplaintCategoryKeysForRoles(
    roles: string[],
): Promise<string[]> {
    const definitions = await ComplaintTypeDefinition.find({
        active: true,
        allowedReceiverRoles: { $in: roles },
    }).select("key");
    return definitions.map(d => d.key);
}
