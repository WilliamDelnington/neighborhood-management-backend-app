import { Organization, User, type IOrganization, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateOrganizationInput,
    UpdateOrganizationInput,
} from "@/validators/organization";

/**
 * Nem HttpError neu userId duoc chon lam nguoi dai dien to chuc khong hop le:
 * khong ton tai, khong dang hoat dong, hoac khong co vai tro house_owner -
 * cung dieu kien voi householdService.validateHeadOfHouseholdUser, vi nguoi
 * dai dien to chuc cung phai la mot tai khoan house_owner thuc su dang nhap
 * duoc.
 */
async function assertRepresentativeUser(userId: string): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) throw new HttpError("Khong tim thay nguoi dung", 404);
    if (user.status !== "active") {
        throw new HttpError(
            "Chỉ có thể chọn tài khoản đang hoạt động làm người đại diện",
            422,
        );
    }
    if (!user.roles.includes("house_owner")) {
        throw new HttpError(
            "Người đại diện phải có vai trò Chủ sở hữu",
            422,
        );
    }
    return user;
}

/**
 * Dieu kien loc danh sach to chuc theo pham vi cua actor:
 * - admin: xem tat ca.
 * - house_owner: chi xem to chuc ma minh la nguoi dai dien.
 */
function organizationScopeFilter(actorUser: IUser): Record<string, unknown> {
    if (actorUser.roles.includes("admin")) return {};
    return { representativeUserId: actorUser._id };
}

export async function listOrganizations(params: {
    page: number;
    limit: number;
    search?: string;
    active?: boolean;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = organizationScopeFilter(
        params.actorUser,
    );

    if (params.active !== undefined) filter.active = params.active;
    if (params.search) {
        filter.$or = [
            { name: { $regex: params.search, $options: "i" } },
            { taxCode: { $regex: params.search, $options: "i" } },
        ];
    }

    const [items, total] = await Promise.all([
        Organization.find(filter)
            .sort({ name: 1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("representativeUserId", "displayName phone"),
        Organization.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

/**
 * Nem HttpError(403) neu actor khong phai admin va khong phai nguoi dai dien
 * cua to chuc nay - dung truoc khi xem/sua mot to chuc cu the.
 */
function assertOrganizationInScope(
    actorUser: IUser,
    organization: IOrganization,
): void {
    if (actorUser.roles.includes("admin")) return;
    if (String(organization.representativeUserId) === String(actorUser._id)) {
        return;
    }
    throw new HttpError(
        "Bạn không có quyền truy cập tổ chức này",
        403,
    );
}

export async function getOrganizationById(
    actorUser: IUser,
    id: string,
): Promise<IOrganization> {
    const organization = await Organization.findById(id);
    if (!organization) throw new HttpError("Khong tim thay to chuc", 404);
    assertOrganizationInScope(actorUser, organization);
    await organization.populate("representativeUserId", "displayName phone");
    return organization;
}

export async function createOrganization(
    actorUser: IUser,
    input: CreateOrganizationInput,
): Promise<IOrganization> {
    // House_owner chi duoc tao to chuc dung ten minh la nguoi dai dien - khong
    // duoc dang ky to chuc thay cho nguoi khac (representativeUserId trong
    // input, neu co gui, bi bo qua). Chi admin moi duoc chi dinh nguoi dai
    // dien khac, va bat buoc phai chon.
    let representativeUserId: string;
    if (actorUser.roles.includes("admin")) {
        if (!input.representativeUserId) {
            throw new HttpError("Vui lòng chọn người đại diện", 422);
        }
        representativeUserId = input.representativeUserId;
    } else {
        representativeUserId = String(actorUser._id);
    }
    await assertRepresentativeUser(representativeUserId);

    // Khong co taxCode thi khong co gi de doi chieu trung lap - bo qua kiem
    // tra (findOne({taxCode: undefined}) se khop nham voi ban ghi khac cung
    // chua co taxCode, sai y nghia "trung lap").
    if (input.taxCode) {
        const existing = await Organization.findOne({ taxCode: input.taxCode });
        if (existing) {
            throw new HttpError(
                "Mã số thuế / số đăng ký kinh doanh đã tồn tại",
                409,
            );
        }
    }

    const organization = await Organization.create({
        ...input,
        representativeUserId,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "organization.create",
        targetModel: "Organization",
        targetId: organization._id,
        metadata: { name: organization.name, taxCode: organization.taxCode },
    });

    await organization.populate("representativeUserId", "displayName phone");
    return organization;
}

export async function updateOrganization(
    actorUser: IUser,
    id: string,
    patch: UpdateOrganizationInput,
): Promise<IOrganization> {
    const organization = await Organization.findById(id);
    if (!organization) throw new HttpError("Khong tim thay to chuc", 404);
    assertOrganizationInScope(actorUser, organization);

    if (patch.representativeUserId) {
        await assertRepresentativeUser(patch.representativeUserId);
    }

    const priorState = organization.toObject();
    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (organization as unknown as Record<string, unknown>)[key] = value;
        }
    }
    organization.updatedBy = actorUser._id as any;
    await organization.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "organization.update",
        targetModel: "Organization",
        targetId: organization._id,
        metadata: { before: priorState, after: patch },
    });

    await organization.populate("representativeUserId", "displayName phone");
    return organization;
}
