import {
    Business,
    HouseRecord,
    BusinessType,
    type IBusiness,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { clusterScopeFilter, userHasPermission } from "@/lib/rbac";
import { writeAuditLog } from "@/services/auditService";
import { createNotification } from "@/services/notificationService";
import {
    assertHouseRecordInScope,
    getOwnedHouseRecordIds,
} from "@/services/houseRecordService";
import { BUSINESS_STATUS_LABEL, type BusinessStatus } from "@/types";
import type {
    CreateBusinessInput,
    UpdateBusinessInput,
} from "@/validators/business";

/**
 * Nem HttpError(404) neu businessType duoc chon khong ton tai - tranh ho
 * kinh doanh tro toi mot loai hinh da bi xoa hoac chua bao gio ton tai.
 */
async function assertBusinessTypeExists(businessType?: string | null): Promise<void> {
    if (!businessType) return;
    const exists = await BusinessType.exists({ _id: businessType });
    if (!exists) {
        throw new HttpError("Khong tim thay loai hinh kinh doanh", 404);
    }
}

export async function createBusiness(
    actorUser: IUser,
    input: CreateBusinessInput,
): Promise<IBusiness> {
    const houseRecord = await HouseRecord.findById(input.houseId);
    if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);
    assertHouseRecordInScope(actorUser, houseRecord);
    await assertBusinessTypeExists(input.businessType);

    const business = await Business.create({
        name: input.name,
        houseId: input.houseId,
        cluster: houseRecord.cluster,
        businessType: input.businessType || undefined,
        ownerName: input.ownerName,
        phone: input.phone,
        active: input.active ?? true,
        note: input.note,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "business.create",
        targetModel: "Business",
        targetId: business._id,
        metadata: { name: business.name, houseId: input.houseId },
    });

    return business;
}

/**
 * Danh sach ho kinh doanh. Co hai cach dung:
 * - Nested theo mot nha so cu the (houseId truyen vao) - quyen truy cap nha
 *   so do da duoc route goi kiem tra truoc (assertHouseRecordInScope), nen ap
 *   dung filter truc tiep, khong loc lai theo actorUser o day.
 * - Danh sach tong hop tren toan bo pham vi cua actorUser (khong truyen
 *   houseId) - dung cho man "Danh sach ho kinh doanh" o Danh muc:
 *   - admin: xem tat ca.
 *   - house_owner: chi xem ho kinh doanh thuoc cac nha ma minh so huu -
 *     KHONG duoc roi vao nhanh clusterScopeFilter, vi house_owner luon co
 *     assignedClusters rong (se bi hieu nham la "khong gioi han").
 *   - nhan vien: theo assignedClusters, ap dung truc tiep tren truong
 *     `cluster` cua Business (da duoc denormalize tu HouseRecord luc tao).
 */
export async function listBusinesses(params: {
    houseId?: string;
    page?: number;
    limit?: number;
    search?: string;
    actorUser?: IUser;
}) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const filter: Record<string, unknown> = {};

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
            Object.assign(filter, clusterScopeFilter(params.actorUser));
        }
    }

    if (params.search) {
        filter.name = { $regex: params.search, $options: "i" };
    }

    let query = Business.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("businessType", "name");
    if (!params.houseId) {
        query = query.populate("houseId", "code address cluster");
    }

    const [items, total] = await Promise.all([
        query,
        Business.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getBusinessById(id: string): Promise<IBusiness> {
    const business = await Business.findById(id)
        .populate("businessType", "name")
        // Populate them ownerId de frontend tinh "co phai chu nha khong" ma
        // khong can goi rieng API nha so (dung cho man chi tiet ho kinh doanh
        // hien nut gui duyet/duyet/tu choi).
        .populate("houseId", "code address cluster ownerId status");
    if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);
    return business;
}

export async function updateBusiness(
    actorUser: IUser,
    id: string,
    patch: UpdateBusinessInput,
): Promise<IBusiness> {
    const business = await Business.findById(id);
    if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);

    const houseRecord = await HouseRecord.findById(business.houseId);
    if (houseRecord) assertHouseRecordInScope(actorUser, houseRecord);

    if (patch.businessType) {
        await assertBusinessTypeExists(patch.businessType);
    }

    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (business as unknown as Record<string, unknown>)[key] = value;
        }
    }
    business.updatedBy = actorUser._id as any;
    await business.save();
    await business.populate("businessType", "name");

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "business.update",
        targetModel: "Business",
        targetId: business._id,
        metadata: patch,
    });

    return business;
}

/**
 * Chuyen trang thai xac thuc cua ho kinh doanh - luat giong het
 * transitionHouseRecordStatus (houseRecordService.ts), chi khac "chu ho kinh
 * doanh" duoc suy ra qua nha so lien ket (Business khong co ownerId rieng):
 * - admin: duoc chuyen sang bat ky trang thai nao.
 * - chu nha (ownerId cua HouseRecord lien ket trung actor): chi duoc gui/gui
 *   lai de duyet (unverified|denied -> pending).
 * - nhan vien co quyen "businesses.verify" va nam trong pham vi nha lien ket
 *   (assertHouseRecordInScope): chi duoc duyet/tu choi khi dang "pending".
 * Ho kinh doanh da bi khoa thi khong ai ngoai admin duoc doi trang thai.
 */
export async function transitionBusinessStatus(
    actorUser: IUser,
    id: string,
    targetStatus: BusinessStatus,
): Promise<IBusiness> {
    const business = await Business.findById(id);
    if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);

    const houseRecord = await HouseRecord.findById(business.houseId);
    if (!houseRecord) {
        throw new HttpError("Khong tim thay nha so cua ho kinh doanh nay", 404);
    }

    const isAdmin = actorUser.roles.includes("admin");
    const isOwner =
        !!houseRecord.ownerId &&
        String(houseRecord.ownerId) === String(actorUser._id);

    if (!isAdmin) {
        if (business.status === "locked") {
            throw new HttpError(
                "Hộ kinh doanh đã bị khóa, chỉ quản trị viên mới có thể thay đổi trạng thái",
                403,
            );
        }

        if (isOwner) {
            const canSubmit =
                targetStatus === "pending" &&
                ["unverified", "denied"].includes(business.status);
            if (!canSubmit) {
                throw new HttpError(
                    "Chủ hộ kinh doanh chỉ được gửi duyệt từ trạng thái chưa xác thực hoặc bị từ chối",
                    403,
                );
            }
        } else {
            if (!(await userHasPermission(actorUser, "businesses.verify"))) {
                throw new HttpError(
                    "Bạn không có quyền duyệt/từ chối hộ kinh doanh",
                    403,
                );
            }
            assertHouseRecordInScope(actorUser, houseRecord);
            const canVerify =
                business.status === "pending" &&
                ["verified", "denied"].includes(targetStatus);
            if (!canVerify) {
                throw new HttpError(
                    "Chỉ được duyệt hoặc từ chối hộ kinh doanh đang chờ duyệt",
                    403,
                );
            }
        }
    }

    const previousStatus = business.status;
    business.status = targetStatus;
    business.updatedBy = actorUser._id as any;
    await business.save();

    if (
        houseRecord.ownerId &&
        previousStatus !== targetStatus &&
        (targetStatus === "verified" || targetStatus === "denied")
    ) {
        await createNotification({
            title: "Kết quả xác thực hộ kinh doanh",
            body: `Hộ kinh doanh ${business.name} của bạn ${
                BUSINESS_STATUS_LABEL[targetStatus]
            }`,
            type: "business.status_changed",
            targetUserIds: [houseRecord.ownerId],
            relatedModel: "Business",
            relatedId: business._id,
            createdBy: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "business.status_change",
        targetModel: "Business",
        targetId: business._id,
        metadata: { status: targetStatus },
    });

    return business;
}

export async function deleteBusiness(
    actorUser: IUser,
    id: string,
): Promise<IBusiness> {
    const business = await Business.findById(id);
    if (!business) throw new HttpError("Khong tim thay ho kinh doanh", 404);

    const houseRecord = await HouseRecord.findById(business.houseId);
    if (houseRecord) assertHouseRecordInScope(actorUser, houseRecord);

    await business.deleteOne();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "business.delete",
        targetModel: "Business",
        targetId: id,
        metadata: { name: business.name },
    });

    return business;
}
