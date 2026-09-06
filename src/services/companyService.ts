import {
    Company,
    HouseRecord,
    HouseUsageUnit,
    BusinessType,
    type ICompany,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { areaScopeFilter } from "@/lib/rbac";
import { writeAuditLog } from "@/services/auditService";
import { createNotification } from "@/services/notificationService";
import {
    assertHouseRecordAllowsDeclaration,
    assertHouseRecordInScope,
    assertVerificationEditable,
    getOwnedHouseRecordIds,
    resolveInitialVerificationStatus,
} from "@/services/houseRecordService";
import {
    isHouseOwnerActor,
    resolveActiveHouseOwnerActingUserIds,
} from "@/services/houseOwnershipService";
import { VERIFICATION_STATUS_LABEL, type VerificationStatus } from "@/types";
import type {
    CreateCompanyInput,
    UpdateCompanyInput,
} from "@/validators/company";

/**
 * Nem HttpError(404) neu MOT trong cac businessTypeIds duoc chon khong ton
 * tai - tranh cong ty tro toi loai hinh da bi xoa hoac chua bao gio ton tai.
 * Khac assertBusinessTypeExists cua Business (mot gia tri) - ham nay nhan
 * MANG vi mot cong ty co the co nhieu loai hinh kinh doanh cung luc.
 */
async function assertBusinessTypesExist(ids?: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const count = await BusinessType.countDocuments({ _id: { $in: ids } });
    if (count !== new Set(ids).size) {
        throw new HttpError("Có loại hình kinh doanh không tồn tại", 404);
    }
}

export async function createCompany(
    actorUser: IUser,
    input: CreateCompanyInput,
): Promise<ICompany> {
    const houseRecord = await HouseRecord.findById(input.houseId);
    if (!houseRecord) throw new HttpError("Không tìm thấy nhà số", 404);
    await assertHouseRecordInScope(actorUser, houseRecord);
    // Cung dieu kien voi Household/Business - cong ty tao ra se o trang thai
    // "unverified"/"pending" cho toi khi duoc xac thuc rieng (xem
    // resolveInitialVerificationStatus).
    assertHouseRecordAllowsDeclaration(actorUser, houseRecord);
    await assertBusinessTypesExist(input.businessTypeIds);

    const company = await Company.create({
        name: input.name,
        houseId: input.houseId,
        cluster: houseRecord.cluster,
        streetId: houseRecord.streetId,
        neighborhoodId: houseRecord.neighborhoodId,
        ownerName: input.ownerName,
        taxCode: input.taxCode,
        representativeUserId: input.representativeUserId || undefined,
        organizationId: input.organizationId || undefined,
        businessTypeIds: input.businessTypeIds || [],
        phone: input.phone,
        active: input.active ?? true,
        status: resolveInitialVerificationStatus(houseRecord),
        note: input.note,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "company.create",
        targetModel: "Company",
        targetId: company._id,
        metadata: { name: company.name, houseId: input.houseId },
    });

    return company;
}

/**
 * Danh sach cong ty - cung hai cach dung nhu listBusinesses (nested theo mot
 * nha so cu the, hoac tong hop theo pham vi cua actorUser).
 */
export async function listCompanies(params: {
    houseId?: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: VerificationStatus;
    // Loc "co chua loai hinh nay" - mot gia tri filter khop bat ky cong ty
    // nao co id nay trong mang businessTypeIds (khac Business - loc bang).
    businessType?: string;
    actorUser?: IUser;
}) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const filter: Record<string, unknown> = {};

    if (params.status) {
        filter.status = params.status;
    }

    if (params.businessType) {
        filter.businessTypeIds = params.businessType;
    }

    if (params.houseId) {
        filter.houseId = params.houseId;
    } else if (params.actorUser) {
        const isAdminUser = params.actorUser.roles.includes("admin");
        const isHouseOwnerUser = params.actorUser.roles.includes("house_owner");
        if (isHouseOwnerUser) {
            const ownedHouseIds = await getOwnedHouseRecordIds(
                params.actorUser._id,
            );
            filter.houseId = { $in: ownedHouseIds };
        } else if (!isAdminUser) {
            Object.assign(filter, areaScopeFilter(params.actorUser));
        }
    }

    if (params.search) {
        filter.name = { $regex: params.search, $options: "i" };
    }

    let query = Company.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("organizationId", "name")
        .populate("businessTypeIds", "name");
    if (!params.houseId) {
        query = query.populate("houseId", "code address cluster");
    }

    const [items, total] = await Promise.all([
        query,
        Company.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getCompanyById(id: string): Promise<ICompany> {
    const company = await Company.findById(id)
        .populate("houseId", "code address cluster ownerId ownerType status")
        .populate("representativeUserId", "displayName phone")
        .populate("organizationId", "name")
        .populate("businessTypeIds", "name");
    if (!company) throw new HttpError("Không tìm thấy công ty", 404);
    return company;
}

export async function updateCompany(
    actorUser: IUser,
    id: string,
    patch: UpdateCompanyInput,
): Promise<ICompany> {
    const company = await Company.findById(id);
    if (!company) throw new HttpError("Không tìm thấy công ty", 404);

    const houseRecord = await HouseRecord.findById(company.houseId);
    if (houseRecord) await assertHouseRecordInScope(actorUser, houseRecord);

    assertVerificationEditable(actorUser, company.status, "Công ty");

    if (patch.businessTypeIds) {
        await assertBusinessTypesExist(patch.businessTypeIds);
    }

    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (company as unknown as Record<string, unknown>)[key] = value;
        }
    }
    company.updatedBy = actorUser._id as any;
    await company.save();
    await company.populate("representativeUserId", "displayName phone");
    await company.populate("organizationId", "name");
    await company.populate("businessTypeIds", "name");

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "company.update",
        targetModel: "Company",
        targetId: company._id,
        metadata: patch,
    });

    return company;
}

/**
 * Chuyen trang thai xac thuc thu cong - khong co quy trinh nop/duyet giay to
 * rieng nhu Business (khong co CompanyDocument), nen day la CACH DUY NHAT de
 * doi trang thai cong ty:
 * - admin: ghi de sang bat ky trang thai nao.
 * - chu ho (isHouseOwnerActor): CHI duoc "gui lai" tu "denied" ve "pending".
 */
export async function transitionCompanyStatus(
    actorUser: IUser,
    id: string,
    targetStatus: VerificationStatus,
): Promise<ICompany> {
    const company = await Company.findById(id);
    if (!company) throw new HttpError("Không tìm thấy công ty", 404);

    const isAdmin = actorUser.roles.includes("admin");
    if (!isAdmin) {
        const isOwner = await isHouseOwnerActor(company.houseId, actorUser._id);
        const canResubmit =
            isOwner && company.status === "denied" && targetStatus === "pending";
        if (!canResubmit) {
            throw new HttpError(
                "Bạn không có quyền thay đổi trạng thái công ty này",
                403,
            );
        }
    }

    const previousStatus = company.status;
    company.status = targetStatus;
    company.updatedBy = actorUser._id as any;
    await company.save();

    const ownerActingUserIds = await resolveActiveHouseOwnerActingUserIds(
        company.houseId,
    );
    if (
        ownerActingUserIds.length &&
        previousStatus !== targetStatus &&
        (targetStatus === "verified" || targetStatus === "denied")
    ) {
        await createNotification({
            title: "Kết quả xác thực công ty",
            body: `Công ty ${company.name} của bạn ${
                VERIFICATION_STATUS_LABEL[targetStatus]
            }`,
            type: "company.status_changed",
            targetUserIds: ownerActingUserIds,
            relatedModel: "Company",
            relatedId: company._id,
            createdBy: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "company.status_change",
        targetModel: "Company",
        targetId: company._id,
        metadata: { previousStatus, status: targetStatus },
    });

    return company;
}

export async function deleteCompany(
    actorUser: IUser,
    id: string,
): Promise<ICompany> {
    const company = await Company.findById(id);
    if (!company) throw new HttpError("Không tìm thấy công ty", 404);

    const houseRecord = await HouseRecord.findById(company.houseId);
    if (houseRecord) await assertHouseRecordInScope(actorUser, houseRecord);

    // Khong duoc xoa cong ty da xac thuc - giong nguyen tac "khong xoa lich
    // su" cua Business (dung active=false de "ngung hoat dong" thay vi xoa).
    if (company.status !== "unverified") {
        throw new HttpError(
            "Không thể xóa công ty đã xác thực - hãy chuyển sang ngừng hoạt động (active=false) để giữ lịch sử",
            409,
        );
    }

    const linkedUnit = await HouseUsageUnit.exists({ companyId: id });
    if (linkedUnit) {
        throw new HttpError(
            "Không thể xóa công ty đang gắn với một đơn vị sử dụng - hãy gỡ đơn vị sử dụng trước",
            409,
        );
    }

    await company.deleteOne();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "company.delete",
        targetModel: "Company",
        targetId: id,
        metadata: { name: company.name },
    });

    return company;
}
