import type mongoose from "mongoose";
import {
    Complaint,
    ComplaintTimeline,
    Household,
    Citizen,
    HouseRecord,
    Neighborhood,
    NeighborhoodColeaderAssignment,
    Request as RequestModel,
    RequestRecipient,
    User,
    type IComplaint,
    type IComplaintTypeDefinition,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateYearlyCode } from "@/lib/utils";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { areaScopeFilter } from "@/lib/rbac";
import { getHouseIdsForActingOwner } from "@/services/houseOwnershipService";
import { getSetting } from "@/services/settingsService";
import { getComplaintTypeByKey } from "@/services/complaintTypeDefinitionService";
import {
    NHOM_PHAN_ANH,
    TRANG_THAI_PHAN_ANH_LABEL,
    type RequestStatus,
    type TrangThaiPhanAnh,
} from "@/types";
import type {
    AssignComplaintInput,
    CreateComplaintInput,
    RequestComplaintInfoInput,
    RequestReevaluationInput,
    UpdateComplaintInput,
    UpdateComplaintStatusInput,
} from "@/validators/complaint";

/**
 * Suy ra cum dan cu cua nguoi tao phan anh de denormalize vao Complaint.cluster,
 * dung cho loc theo pham vi phu trach. Uu tien ho khau, roi den nhan khau (join
 * qua ho khau), cuoi cung la cum dau tien duoc phan cong (truong hop nhan vien
 * tu gui phan anh). Tra ve undefined neu khong the xac dinh (vd tai khoan chua
 * lien ket ho khau/nhan khau va khong duoc phan cong cum nao).
 */
export async function resolveComplaintCluster(
    user: IUser,
): Promise<string | undefined> {
    if (user.householdId) {
        const household = await Household.findById(user.householdId).select(
            "cluster",
        );
        if (household) return household.cluster;
    }
    if (user.citizenId) {
        const citizen = await Citizen.findById(user.citizenId).populate(
            "householdId",
            "cluster",
        );
        const household = citizen?.householdId as
            | { cluster?: string }
            | undefined;
        if (household?.cluster) return household.cluster;
    }
    // Chu nha (house_owner) khong chac co Household/Citizen rieng - to chuc/
    // doanh nghiep dai dien qua Organization, hoac chu nha ca nhan chua tao
    // Household, van phai suy ra duoc qua chinh cac Nha ho dang dung vai tro
    // chu so huu (truc tiep hoac dai dien to chuc) - xem getHouseIdsForActingOwner.
    // Chi tu resolve khi KHONG mo ho: neu cac nha ho so huu thuoc nhieu cum
    // khac nhau, doan dai mot cum bat ky (vd chi lay findOne dau tien) se sai
    // nhieu hon dung - tra ve undefined de roi ve co che chuyen tiep cap
    // Phuong (an toan hon la gui nham to/cum).
    const ownedHouseIds = await getHouseIdsForActingOwner(user._id);
    if (ownedHouseIds.length) {
        const clusters = await HouseRecord.distinct("cluster", {
            _id: { $in: ownedHouseIds },
            cluster: { $exists: true, $ne: null },
        });
        if (clusters.length === 1) return clusters[0];
    }
    if (user.assignedClusters?.length) return user.assignedClusters[0];
    return undefined;
}

/**
 * Tuong tu resolveComplaintCluster nhung suy ra to dan pho (neighborhoodId)
 * de denormalize vao Complaint.neighborhoodId - dung cho areaScopeFilter khi
 * actor la neighborhood_leader. Uu tien ho khau, roi den nhan khau (join qua
 * ho khau), cuoi cung la to dan pho cua chinh nguoi tao (truong hop nhan vien
 * tu gui phan anh).
 */
export async function resolveComplaintNeighborhoodId(
    user: IUser,
): Promise<mongoose.Types.ObjectId | undefined> {
    if (user.householdId) {
        const household = await Household.findById(user.householdId).select(
            "neighborhoodId",
        );
        if (household?.neighborhoodId) return household.neighborhoodId;
    }
    if (user.citizenId) {
        const citizen = await Citizen.findById(user.citizenId).populate(
            "householdId",
            "neighborhoodId",
        );
        const household = citizen?.householdId as
            | { neighborhoodId?: mongoose.Types.ObjectId }
            | undefined;
        if (household?.neighborhoodId) return household.neighborhoodId;
    }
    // Tuong tu resolveComplaintCluster o tren - thu tiep qua cac Nha ma user
    // dang dung vai tro chu so huu truoc khi roi ve neighborhoodId cua chinh
    // user (chi co y nghia voi nhan vien duoc gan to dan pho phu trach). Chi
    // tu resolve khi KHONG mo ho: mot nguoi co the so huu nha o nhieu to dan
    // pho khac nhau - neu phan anh khong noi ro nha nao, doan dai mot to bat
    // ky (vd lay findOne dau tien) co the gui NHAM sang to khong lien quan.
    // Tra ve undefined trong truong hop mo ho de roi ve co che chuyen tiep
    // cap Phuong (secretary/PCO), an toan hon la doan sai.
    const ownedHouseIds = await getHouseIdsForActingOwner(user._id);
    if (ownedHouseIds.length) {
        const neighborhoodIds = await HouseRecord.distinct("neighborhoodId", {
            _id: { $in: ownedHouseIds },
            neighborhoodId: { $exists: true, $ne: null },
        });
        if (neighborhoodIds.length === 1) return neighborhoodIds[0];
    }
    if (user.neighborhoodId) return user.neighborhoodId;
    return undefined;
}

/**
 * Suy ra wardCode de denormalize vao Complaint.wardCode, dam bao MOI phan anh
 * co mot "diem den" ke ca khi khong xac dinh duoc to dan pho cu the. Uu tien
 * wardCode cua chinh to dan pho da resolve (neighborhoodId), roi den wardCode
 * cua nguoi tao (nhan vien duoc gan phu trach mot phuong), cuoi cung la
 * setting "default_ward_code" - ung dung hien chi van hanh trong MOT phuong
 * nen fallback nay la hop ly; khi mo rong nhieu phuong, day se la diem can
 * xem lai (khong con dung mot default chung cho tat ca nua).
 */
export async function resolveComplaintWardCode(
    user: IUser,
    resolvedNeighborhoodId?: mongoose.Types.ObjectId,
): Promise<number | undefined> {
    if (resolvedNeighborhoodId) {
        const neighborhood = await Neighborhood.findById(
            resolvedNeighborhoodId,
        ).select("wardCode");
        if (neighborhood?.wardCode) return neighborhood.wardCode;
    }
    if (user.wardCode) return user.wardCode;
    const defaultWardCode = await getSetting("default_ward_code");
    if (typeof defaultWardCode === "number") return defaultWardCode;
    if (typeof defaultWardCode === "string" && defaultWardCode.trim()) {
        const parsed = Number(defaultWardCode);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
}

/**
 * Dieu kien Mongo loc phan anh theo pham vi. Neu actor duoc cap
 * complaints.read_escalated, pham vi la "da chuyen UBND, cong voi cum duoc
 * phan cong (neu co), cong voi phan anh KHONG xac dinh duoc CA to dan pho LAN
 * cum" - KHONG ke thua quy uoc "assignedClusters rong = khong gioi han" cua
 * clusterScopeFilter, vi day la quyen bo sung hep (danh cho can bo UBND/bi
 * thu), khong phai mo khoa toan bo. Nhanh "khong xac dinh duoc" la co che
 * chuyen tiep len cap Phuong khi khong the giao cho mot To dan pho HAY mot
 * cum cu the nao (vd tai khoan/nha chua lien ket day du) - xem cau hoi nguoi
 * dung ve "huge contradiction" giua yeu cau co Nha so va co che chuyen tiep
 * len Phuong. Bat buoc ca hai deu thieu (khong chi neighborhoodId) de tranh
 * lo pham vi cum cho cac phan anh van con duoc gan cum theo kieu cu (truoc
 * khi co neighborhoodId) - nhung phan anh do van phai duoc loc theo cum nhu
 * truoc, khong duoc coi la "chuyen tiep len Phuong". Neu khong duoc cap
 * complaints.read_escalated, dung lai clusterScopeFilter nhu thuong le (rong =
 * khong gioi han, giu nguyen hanh vi hien tai cho cac tai khoan chua duoc gan
 * cum).
 */
async function complaintScopeFilter(
    actorUser: IUser,
    canReadEscalated: boolean,
): Promise<Record<string, unknown>> {
    if (actorUser.roles.includes("admin")) return {};
    if (canReadEscalated) {
        const clusters = actorUser.assignedClusters || [];
        const or: Record<string, unknown>[] = [
            { escalatedToCommittee: true },
            // {field: null} khop CA hai truong hop field khong ton tai va field
            // duoc luu explicit null - an toan hon $exists:false don thuan.
            { neighborhoodId: null, cluster: null },
        ];
        if (clusters.length) or.push({ cluster: { $in: clusters } });
        return { $or: or };
    }
    return await areaScopeFilter(actorUser);
}

/**
 * Nem HttpError(403) neu actor khong duoc phep xem chi tiet phan anh nay
 * ngoai pham vi phu trach. Voi nhan vien theo cluster (legacy): phan anh cu
 * chua co cluster van xem duoc qua link truc tiep - chi bi loai khoi danh
 * sach (xem complaintScopeFilter), khong bi chan hoan toan. Voi
 * neighborhood_leader: nguoc lai, khong xac dinh duoc pham vi (to truong
 * chua duoc gan to dan pho, hoac phan anh khong xac dinh duoc neighborhoodId)
 * nghia la TU CHOI - giong quy uoc cua Household/PcccCheck/SecurityRecord/
 * HouseRecord, khong ke thua su khoan dung cua nhanh cluster.
 */
export function assertComplaintInScope(
    actorUser: IUser,
    complaint: IComplaint,
    canReadEscalated: boolean,
): void {
    if (actorUser.roles.includes("admin")) return;
    const clusters = actorUser.assignedClusters || [];
    if (canReadEscalated) {
        if (complaint.escalatedToCommittee) return;
        if (!complaint.neighborhoodId && !complaint.cluster) return;
        if (
            clusters.length &&
            complaint.cluster &&
            clusters.includes(complaint.cluster)
        ) {
            return;
        }
        throw new HttpError(
            "Bạn không có quyền xem phản ánh này (ngoài phạm vi phụ trách)",
            403,
        );
    }
    if (
        actorUser.roles.includes("neighborhood_leader") ||
        actorUser.roles.includes("neighborhood_coleader")
    ) {
        // Khac voi cluster (quy uoc cu: khong xac dinh duoc = cho xem), voi
        // neighborhoodId dung quy uoc chat hon giong Household/PcccCheck/
        // SecurityRecord/HouseRecord: khong xac dinh duoc pham vi (to truong
        // chua duoc gan to dan pho, hoac phan anh khong xac dinh duoc
        // neighborhoodId) nghia la TU CHOI, khong phai cho qua.
        const ids = [
            actorUser.neighborhoodId,
            ...(actorUser.assignedNeighborhoodIds || []),
        ]
            .filter(Boolean)
            .map(String);
        if (
            !complaint.neighborhoodId ||
            !ids.includes(String(complaint.neighborhoodId))
        ) {
            throw new HttpError(
                "Bạn không có quyền xem phản ánh này (ngoài phạm vi phụ trách)",
                403,
            );
        }
        return;
    }

    if (!clusters.length) return;
    if (complaint.cluster && !clusters.includes(complaint.cluster)) {
        throw new HttpError(
            "Bạn không có quyền xem phản ánh này (ngoài phạm vi phụ trách)",
            403,
        );
    }
}

// Danh sach NHOM_PHAN_ANH cu (hardcode) - chi con dung lam fallback trong
// assertValidComplaintCategory ben duoi, cho giai doan migrate TRUOC khi chay
// scripts/seed-complaint-types.ts (luc do MOI category deu chua co
// ComplaintTypeDefinition tuong ung).
const LEGACY_COMPLAINT_CATEGORIES = new Set<string>(NHOM_PHAN_ANH);

/**
 * Xac thuc `category` hop le va tra ve ComplaintTypeDefinition tuong ung (neu
 * co). Zod schema (validators/complaint.ts) chi kiem tra HINH THUC cua
 * category (permissive string) - kiem tra GIA TRI THUC te (co ton tai/active
 * hay khong) dat o day, cung quy uoc voi RequestTypeDefinition/Request.type
 * (xem findRequestTypeForActor trong requestTypeDefinitionService.ts). Cho
 * phep fallback ve LEGACY_COMPLAINT_CATEGORIES khi CHUA co danh muc tuong
 * ung trong DB, tranh chan phan anh trong giai doan migrate.
 */
async function assertValidComplaintCategory(
    category: string,
): Promise<IComplaintTypeDefinition | null> {
    const definition = await getComplaintTypeByKey(category);
    if (definition) {
        if (!definition.active) {
            throw new HttpError("Loại phản ánh này đã ngừng sử dụng", 422);
        }
        return definition;
    }
    if (LEGACY_COMPLAINT_CATEGORIES.has(category)) return null;
    throw new HttpError("Nhóm phản ánh không hợp lệ", 422);
}

// Trong 3 vai tro nay, chi vai tro nao XUAT HIEN trong
// ComplaintTypeDefinition.allowedReceiverRoles moi duoc thu resolve nguoi
// dung THEO NHA SO (vi tri trong mang quyet dinh thu tu uu tien) - cac vai
// tro khac trong danh sach (vd secretary, people_committee_official) luon roi
// ve nhanh broadcast theo vai tro ben duoi.
const HOUSE_SCOPED_COMPLAINT_ROLES = new Set([
    "neighborhood_leader",
    "neighborhood_coleader",
    "cooperator",
]);

/**
 * Dieu huong nguoi nhan/nguoi phu trach chinh cho mot phan anh, dua tren
 * ComplaintTypeDefinition.allowedReceiverRoles (thu tu trong mang la thu tu
 * uu tien) va Nha so nguoi gui CHU DONG chon (neu co). Thay the logic suy
 * to truong/to pho INLINE cu trong createComplaint bang mot dinh tuyen theo
 * DU LIEU, mo rong them "cooperator" (cong tac vien duoc gan theo cum).
 *
 * Uu tien 1 - theo Nha so (chi khi targetHouseId co gia tri): duyet
 * allowedReceiverRoles THEO DUNG THU TU trong mang, voi moi vai tro thuoc
 * HOUSE_SCOPED_COMPLAINT_ROLES thu resolve nguoi dung dang quan ly nha do
 * (to truong/to pho cua to dan pho chua nha, hoac cong tac vien duoc gan
 * dung cum cua nha). Vai tro DAU TIEN (theo thu tu mang) resolve duoc >=1
 * nguoi se DUNG NGAY (khong xet tiep cac vai tro con lai) - nguoi dau tien
 * trong tap ket qua (sap xep theo _id de dam bao xac dinh) duoc chon lam
 * autoAssigneeId.
 *
 * Uu tien 2 - broadcast theo vai tro (fallback): ap dung khi khong co
 * targetHouseId, KHONG co vai tro nao thuoc HOUSE_SCOPED_COMPLAINT_ROLES
 * trong allowedReceiverRoles, hoac co nhung khong resolve duoc nguoi dung
 * nao (vd to dan pho chua co to truong/to pho, chua co cong tac vien nao
 * dung cum). Cac vai tro CON LAI trong allowedReceiverRoles duoc broadcast
 * toi TOAN BO User dang active co vai tro do, gioi han theo wardCode cua
 * Nha so (neu xac dinh duoc) - cung quy uoc voi nhanh "wardRecipients" cu
 * trong createComplaint (truoc khi co ham nay), khong co autoAssigneeId.
 */
export async function resolveComplaintTypeRecipientIds(
    complaintType: IComplaintTypeDefinition,
    targetHouseId: string | undefined,
): Promise<{ recipientIds: Set<string>; autoAssigneeId?: string }> {
    let houseNeighborhoodId: mongoose.Types.ObjectId | undefined;
    let houseCluster: string | undefined;
    let houseWardCode: number | undefined;
    if (targetHouseId) {
        const house = await HouseRecord.findById(targetHouseId).select(
            "neighborhoodId cluster wardCode",
        );
        houseNeighborhoodId = house?.neighborhoodId;
        houseCluster = house?.cluster;
        houseWardCode = house?.wardCode;
    }

    if (targetHouseId) {
        for (const role of complaintType.allowedReceiverRoles) {
            if (!HOUSE_SCOPED_COMPLAINT_ROLES.has(role)) continue;

            const roleUserIds: string[] = [];
            if (role === "neighborhood_leader" && houseNeighborhoodId) {
                const neighborhood = await Neighborhood.findById(
                    houseNeighborhoodId,
                ).select("leaderUserId");
                if (neighborhood?.leaderUserId) {
                    roleUserIds.push(String(neighborhood.leaderUserId));
                }
            } else if (role === "neighborhood_coleader" && houseNeighborhoodId) {
                const coleaders = await NeighborhoodColeaderAssignment.find({
                    neighborhoodId: houseNeighborhoodId,
                    unassignedAt: { $exists: false },
                })
                    .select("coleaderUserId")
                    .sort({ coleaderUserId: 1 });
                coleaders.forEach(c => roleUserIds.push(String(c.coleaderUserId)));
            } else if (role === "cooperator" && houseCluster) {
                const cooperators = await User.find({
                    status: "active",
                    roles: "cooperator",
                    assignedClusters: houseCluster,
                })
                    .select("_id")
                    .sort({ _id: 1 });
                cooperators.forEach(u => roleUserIds.push(String(u._id)));
            }

            if (roleUserIds.length > 0) {
                return {
                    recipientIds: new Set(roleUserIds),
                    autoAssigneeId: roleUserIds[0],
                };
            }
        }
    }

    const broadcastRoles = complaintType.allowedReceiverRoles.filter(
        role => !HOUSE_SCOPED_COMPLAINT_ROLES.has(role),
    );
    const recipientIds = new Set<string>();
    if (broadcastRoles.length > 0) {
        const filter: Record<string, unknown> = {
            status: "active",
            roles: { $in: broadcastRoles },
        };
        if (houseWardCode) filter.wardCode = houseWardCode;
        const users = await User.find(filter).select("_id");
        users.forEach(u => recipientIds.add(String(u._id)));
    }
    return { recipientIds };
}

export async function createComplaint(
    actorUser: IUser,
    input: CreateComplaintInput,
) {
    const userId = String(actorUser._id);
    const code = await generateYearlyCode(Complaint, "HB-PA");

    // Nha so nguoi gui CHU DONG chon (khong bat buoc, khong can la nha cua
    // chinh ho - vd bao phan anh ve nha hang xom) luon duoc uu tien lam nguon
    // xac dinh to dan pho/cum, thay vi suy tu ho khau/nha cua nguoi gui - vi
    // day la thong tin ro rang nguoi dung da xac nhan, dang tin cay hon suy
    // doan. Chi roi ve resolveComplaintCluster/resolveComplaintNeighborhoodId
    // khi khong chon nha nao.
    let targetHouseId: mongoose.Types.ObjectId | undefined;
    let cluster: string | undefined;
    let neighborhoodId: mongoose.Types.ObjectId | undefined;
    if (input.houseId) {
        const targetHouse = await HouseRecord.findById(input.houseId).select(
            "neighborhoodId cluster",
        );
        if (!targetHouse) {
            throw new HttpError("Không tìm thấy nhà số được chọn", 404);
        }
        targetHouseId = targetHouse._id as mongoose.Types.ObjectId;
        neighborhoodId = targetHouse.neighborhoodId;
        cluster = targetHouse.cluster;
    } else {
        cluster = await resolveComplaintCluster(actorUser);
        neighborhoodId = await resolveComplaintNeighborhoodId(actorUser);
    }
    const wardCode = await resolveComplaintWardCode(actorUser, neighborhoodId);

    // Dinh tuyen theo ComplaintTypeDefinition (danh muc quan tri duoc, seed tu
    // NHOM_PHAN_ANH cu - xem scripts/seed-complaint-types.ts) khi da co danh
    // muc cho category nay. Neu CHUA co (vd giai doan migrate truoc khi chay
    // seed script), roi ve dung logic INLINE cu (to truong cua nha duoc chon,
    // hoac thong bao rong cap to/phuong) de khong lam gian doan phan anh dang
    // gui - khong duoc throw o day.
    const complaintTypeDefinition = await assertValidComplaintCategory(
        input.category,
    );

    // Khong tu dong gan nguoi phu trach chinh (assigneeId) khi tao phan anh -
    // recipientIds/routed.autoAssigneeId chi dung de XAC DINH nguoi/vai tro
    // se nhan THONG BAO (de ho biet ma vao tiep nhan), KHONG dung de gan san
    // nguoi phu trach. Nguoi phu trach chi duoc gan khi can bo bam "Tiep
    // nhan" (receiveComplaint) hoac "Chon nguoi phu trach" (choosePersonInCharge).
    let recipientIds = new Set<string>();
    if (complaintTypeDefinition) {
        const routed = await resolveComplaintTypeRecipientIds(
            complaintTypeDefinition,
            targetHouseId ? String(targetHouseId) : undefined,
        );
        recipientIds = routed.recipientIds;
    }

    const complaint = await Complaint.create({
        // Neu co draftId (xin truoc qua POST /api/complaints/draft), dung lam
        // _id de cac tai lieu da dinh kem tu form tao (FileAsset.relatedId =
        // draftId) tu dong thuoc ve phan anh nay - xem uploads/token,
        // uploads/attachments.
        _id: input.draftId,
        code,
        category: input.category,
        title: input.title,
        content: input.content,
        area: input.area,
        status: "moi_tiep_nhan",
        cluster,
        neighborhoodId,
        wardCode,
        targetHouseId,
        relatedAssetId: input.relatedAssetId,
        createdByUserId: userId,
    });

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: "moi_tiep_nhan",
        note: "Phản ánh đã được tiếp nhận từ Mini App",
        isPublic: true,
        actorId: userId,
    });

    if (complaintTypeDefinition) {
        if (recipientIds.size > 0) {
            await createNotification({
                title: "Phản ánh mới cần xử lý",
                body: `Mã ${code}: ${input.title}`,
                type: "complaint.created",
                targetUserIds: [...recipientIds],
                relatedModel: "Complaint",
                relatedId: complaint._id,
                createdBy: userId,
            });
        }
        await createNotification({
            title: "Phản ánh mới cần xử lý",
            body: `Mã ${code}: ${input.title}`,
            type: "complaint.created",
            targetRoles: ["admin"],
            relatedModel: "Complaint",
            relatedId: complaint._id,
            createdBy: userId,
        });
    } else if (neighborhoodId) {
        // Neu xac dinh duoc to dan pho, chi bao To truong/To pho CUA TO DO
        // (khong blast toi moi neighborhood_leader trong he thong). Nhanh nay
        // chi con dung khi CHUA co ComplaintTypeDefinition cho category.
        const neighborhood = await Neighborhood.findById(
            neighborhoodId,
        ).select("leaderUserId");
        const coleaders = await NeighborhoodColeaderAssignment.find({
            neighborhoodId,
            unassignedAt: { $exists: false },
        }).select("coleaderUserId");
        const targetUserIds = [
            neighborhood?.leaderUserId,
            ...coleaders.map(c => c.coleaderUserId),
        ].filter(Boolean) as mongoose.Types.ObjectId[];
        if (targetUserIds.length) {
            await createNotification({
                title: "Phản ánh mới cần xử lý",
                body: `Mã ${code}: ${input.title}`,
                type: "complaint.created",
                targetUserIds,
                relatedModel: "Complaint",
                relatedId: complaint._id,
                createdBy: userId,
            });
        }
        await createNotification({
            title: "Phản ánh mới cần xử lý",
            body: `Mã ${code}: ${input.title}`,
            type: "complaint.created",
            targetRoles: ["admin"],
            relatedModel: "Complaint",
            relatedId: complaint._id,
            createdBy: userId,
        });
    } else {
        // Day chinh la truong hop can chuyen tiep len cap Phuong - bao bi
        // thu/can bo UBND thay vi de phan anh "mat tich". Nhanh nay chi con
        // dung khi CHUA co ComplaintTypeDefinition cho category.
        const wardRecipients = wardCode
            ? await User.find({
                  status: "active",
                  wardCode,
                  roles: { $in: ["secretary", "people_committee_official"] },
              }).select("_id")
            : [];
        await createNotification({
            title: "Phản ánh mới cần xử lý (chưa xác định tổ dân phố)",
            body: `Mã ${code}: ${input.title}`,
            type: "complaint.created",
            targetUserIds: wardRecipients.map(user => user._id),
            targetRoles: ["admin"],
            relatedModel: "Complaint",
            relatedId: complaint._id,
            createdBy: userId,
        });
    }

    return complaint;
}

export async function listComplaints(params: {
    page: number;
    limit: number;
    status?: string;
    category?: string;
    search?: string;
    relatedAssetId?: string;
    neighborhoodId?: string;
    allowedCategories?: string[] | null;
    actorUser: IUser;
    canReadEscalated: boolean;
}) {
    const clauses: Record<string, unknown>[] = [];
    if (params.status) clauses.push({ status: params.status });
    if (params.relatedAssetId) {
        clauses.push({ relatedAssetId: params.relatedAssetId });
    }
    if (params.neighborhoodId) {
        clauses.push({ neighborhoodId: params.neighborhoodId });
    }
    if (params.allowedCategories) {
        const categories = params.category
            ? params.allowedCategories.filter(c => c === params.category)
            : params.allowedCategories;
        clauses.push({ category: { $in: categories } });
    } else if (params.category) {
        clauses.push({ category: params.category });
    }
    if (params.search) {
        clauses.push({
            $or: [
                { code: { $regex: params.search, $options: "i" } },
                { title: { $regex: params.search, $options: "i" } },
            ],
        });
    }
    const scope = await complaintScopeFilter(params.actorUser, params.canReadEscalated);
    if (Object.keys(scope).length > 0) clauses.push(scope);
    const filter: Record<string, unknown> =
        clauses.length > 0 ? { $and: clauses } : {};
    const [items, total] = await Promise.all([
        Complaint.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("createdByUserId", "displayName phone")
            .populate("assigneeId", "displayName")
            .populate("targetHouseId", "code address")
            .populate("neighborhoodId", "name code"),
        Complaint.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function listMyComplaints(
    userId: string,
    page: number,
    limit: number,
) {
    const filter = { createdByUserId: userId };
    const [items, total] = await Promise.all([
        Complaint.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Complaint.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export type MyComplaintCounts = {
    inProgress: number;
    overdue: number;
};

const COMPLAINT_TERMINAL_STATUSES = ["hoan_thanh", "dong"];

/**
 * Dem so phan anh ma nguoi dung dang dang nhap la nguoi duoc phan cong xu ly
 * (assigneeId), chia theo dang xu ly / qua han, dung cho widget ca nhan tren
 * dashboard. Qua han la tap con cua dang xu ly (dua vao expectedCompletionDate),
 * khong phai mot trang thai rieng.
 */
export async function getMyAssignedComplaintCounts(
    userId: string,
): Promise<MyComplaintCounts> {
    const rows = await Complaint.find({
        assigneeId: userId,
        status: { $nin: COMPLAINT_TERMINAL_STATUSES },
    }).select("expectedCompletionDate");

    const now = Date.now();
    let overdue = 0;
    for (const row of rows) {
        if (row.expectedCompletionDate && row.expectedCompletionDate.getTime() < now) {
            overdue += 1;
        }
    }

    return { inProgress: rows.length, overdue };
}

async function getTimelineFor(complaintId: string, publicOnly: boolean) {
    const filter: Record<string, unknown> = { complaintId };
    if (publicOnly) filter.isPublic = true;
    return ComplaintTimeline.find(filter).sort({ createdAt: 1 });
}

export interface ComplaintReadRequester {
    userId: string;
    isStaff: boolean;
    allowedCategories?: string[] | null;
    actorUser?: IUser;
    canReadEscalated?: boolean;
}

/**
 * Nem HttpError neu requester khong duoc xem phan anh nay - chu phan anh luon
 * duoc xem; nhan vien phai co complaints.read (isStaff), dung nhom
 * (allowedCategories) va trong pham vi phu trach (assertComplaintInScope).
 * Dung chung cho getComplaintDetailForOwnerOrStaff va route liet ke tai lieu
 * dinh kem cua phan anh (xem /api/complaints/[id]/attachments).
 */
export function assertComplaintReadable(
    complaint: IComplaint,
    requester: ComplaintReadRequester,
): boolean {
    const isOwner =
        String((complaint.createdByUserId as any)?._id || complaint.createdByUserId) ===
        requester.userId;
    if (!requester.isStaff && !isOwner) {
        throw new HttpError("Bạn không có quyền xem phản ánh này", 403);
    }
    if (
        requester.isStaff &&
        !isOwner &&
        requester.allowedCategories &&
        !requester.allowedCategories.includes(complaint.category)
    ) {
        throw new HttpError("Bạn không có quyền xem nhóm phản ánh này", 403);
    }
    if (requester.isStaff && !isOwner && requester.actorUser) {
        assertComplaintInScope(
            requester.actorUser,
            complaint,
            requester.canReadEscalated ?? false,
        );
    }
    return isOwner;
}

export async function getComplaintDetailForOwnerOrStaff(
    complaintId: string,
    requester: ComplaintReadRequester,
) {
    const complaint = await Complaint.findById(complaintId)
        .populate("createdByUserId", "displayName phone")
        .populate("assigneeId", "displayName")
        .populate("targetHouseId", "code address");
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);

    assertComplaintReadable(complaint, requester);

    const timeline = await getTimelineFor(complaintId, !requester.isStaff);
    const plain = complaint.toObject();
    if (!requester.isStaff) delete (plain as any).internalNotes;
    // Chi tinh cho staff - resident khong dung toi flag nay (khong thay nut
    // Tiep nhan/Chon nguoi phu trach), tranh 1 query thua cho request cua ho.
    (plain as any).canReceiveOrChooseAssignee = requester.isStaff
        ? await canReceiveOrChooseAssignee(complaint)
        : false;

    return { complaint: plain, timeline };
}

export async function getComplaintByCode(code: string) {
    const complaint = await Complaint.findOne({ code }).populate(
        "createdByUserId",
        "displayName",
    );
    if (!complaint)
        throw new HttpError("Không tìm thấy phản ánh với mã này", 404);
    const timeline = await getTimelineFor(String(complaint._id), true);
    const plain = complaint.toObject();
    delete (plain as any).internalNotes;
    return { complaint: plain, timeline };
}

export async function updateComplaintStatus(
    actorId: string,
    complaintId: string,
    input: UpdateComplaintStatusInput,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);

    // "hoan_thanh" la nguoi gui phan anh TU XAC NHAN hai long - nhan vien
    // khong duoc dat trang thai nay thay ho, xem confirmComplaintResolution.
    if (input.status === "hoan_thanh") {
        throw new HttpError(
            "Trạng thái này chỉ người gửi phản ánh mới được xác nhận",
            400,
        );
    }

    complaint.status = input.status;
    if (input.status === "da_xu_ly" || input.status === "dong") {
        complaint.actualCompletionDate = new Date();
    }
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: input.status,
        note: input.note,
        isPublic: input.isPublic,
        actorId,
    });

    await createNotification({
        title: "Cập nhật phản ánh của bạn",
        body: `Phản ánh ${complaint.code} đã chuyển sang trạng thái "${
            TRANG_THAI_PHAN_ANH_LABEL[input.status]
        }"`,
        type: "complaint.status_changed",
        targetUserIds: [complaint.createdByUserId],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "complaint.status_change",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { status: input.status },
    });

    return complaint;
}

/**
 * Nem HttpError(403) neu actorUser khong phai chinh nguoi da gui phan anh nay
 * (khong co ngoai le cho admin - ba hanh dong duoi day the hien y kien THUC
 * SU cua nguoi gui, gia mao se lam sai lech du lieu).
 */
function assertIsComplaintSender(complaint: IComplaint, actorUser: IUser): void {
    if (String(complaint.createdByUserId) !== String(actorUser._id)) {
        throw new HttpError(
            "Chỉ người gửi phản ánh này mới được thực hiện hành động này",
            403,
        );
    }
}

const EDITABLE_COMPLAINT_FIELDS = ["category", "title", "content"] as const;

export async function updateComplaint(
    actorUser: IUser,
    complaintId: string,
    patch: UpdateComplaintInput,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);

    if (
        !actorUser.roles.includes("admin") &&
        String(complaint.createdByUserId) !== String(actorUser._id)
    ) {
        throw new HttpError("Bạn không có quyền sửa phản ánh này", 403);
    }
    if (complaint.status === "dong" || complaint.status === "hoan_thanh") {
        throw new HttpError(
            "Phản ánh đã kết thúc, không thể chỉnh sửa nội dung",
            400,
        );
    }

    if (patch.category !== undefined) {
        // Chi kiem tra gia tri hop le (co ton tai/active hay khong) - khong
        // can dung ket qua dinh tuyen o day, sua category KHONG lam lai dinh
        // tuyen nguoi phu trach da co (xem ghi chu EDITABLE_COMPLAINT_FIELDS).
        await assertValidComplaintCategory(patch.category);
    }

    const previousSnapshot: Record<string, unknown> = {};
    const appliedPatch: Record<string, unknown> = {};
    for (const field of EDITABLE_COMPLAINT_FIELDS) {
        if (patch[field] === undefined) continue;
        previousSnapshot[field] = complaint[field];
        appliedPatch[field] = patch[field];
        (complaint as unknown as Record<string, unknown>)[field] = patch[field];
    }

    // Nguoi gui bo sung thong tin -> tu dong quay ve dang_xu_ly (khong can
    // nhan vien lam gi them) - hardcode dang_xu_ly, cung quy uoc voi
    // requestComplaintReevaluation, khong luu/tra ve trang thai truoc do.
    const wasWaitingForInfo = complaint.status === "can_bo_sung";
    if (wasWaitingForInfo) {
        complaint.status = "dang_xu_ly";
    }
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: complaint.status,
        action: "edited",
        patch: appliedPatch,
        previousSnapshot,
        isPublic: true,
        actorId: actorUser._id,
    });
    if (wasWaitingForInfo) {
        await ComplaintTimeline.create({
            complaintId: complaint._id,
            status: "dang_xu_ly",
            action: "status_update",
            isPublic: true,
            actorId: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "complaint.update",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: appliedPatch,
    });

    return complaint;
}

export async function confirmComplaintResolution(
    actorUser: IUser,
    complaintId: string,
    input?: { rating?: number; ratingNote?: string },
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);
    assertIsComplaintSender(complaint, actorUser);
    if (complaint.status !== "da_xu_ly") {
        throw new HttpError(
            "Chỉ xác nhận hoàn thành khi phản ánh đã được xử lý",
            400,
        );
    }
    if (
        input?.rating !== undefined &&
        (input.rating < 1 || input.rating > 5)
    ) {
        throw new HttpError("Đánh giá phải từ 1 đến 5 sao", 400);
    }

    complaint.status = "hoan_thanh";
    if (input?.rating !== undefined) complaint.rating = input.rating;
    if (input?.ratingNote !== undefined) complaint.ratingNote = input.ratingNote;
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: "hoan_thanh",
        action: "status_update",
        note:
            input?.rating !== undefined
                ? `Đánh giá: ${input.rating}/5 sao${
                      input.ratingNote ? ` - ${input.ratingNote}` : ""
                  }`
                : undefined,
        isPublic: true,
        actorId: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "complaint.confirm_resolution",
        targetModel: "Complaint",
        targetId: complaint._id,
    });

    return complaint;
}

export async function requestComplaintReevaluation(
    actorUser: IUser,
    complaintId: string,
    input: RequestReevaluationInput,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);
    assertIsComplaintSender(complaint, actorUser);
    if (complaint.status !== "da_xu_ly") {
        throw new HttpError(
            "Chỉ đề nghị xem xét lại khi phản ánh đã được xử lý",
            400,
        );
    }
    const usedCount = await ComplaintTimeline.countDocuments({
        complaintId: complaint._id,
        action: "reevaluation_request",
    });
    if (usedCount > 0) {
        throw new HttpError(
            "Phản ánh này đã được đề nghị xem xét lại trước đó, không thể gửi thêm",
            400,
        );
    }

    complaint.status = "dang_xu_ly";
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: "dang_xu_ly",
        action: "reevaluation_request",
        note: input.note,
        isPublic: true,
        actorId: actorUser._id,
    });

    await createNotification({
        title: "Phản ánh cần xem xét lại",
        body: `Phản ánh ${complaint.code} bị đề nghị xem xét lại: ${input.note}`,
        type: "complaint.reevaluation_requested",
        targetRoles: ["admin", "secretary", "neighborhood_leader"],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "complaint.request_reevaluation",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { note: input.note },
    });

    return complaint;
}

export async function deleteComplaint(actorId: string, complaintId: string) {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);

    await ComplaintTimeline.deleteMany({ complaintId: complaint._id });
    await complaint.deleteOne();

    await writeAuditLog({
        actorId,
        action: "complaint.delete",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { code: complaint.code },
    });
}

export async function assignComplaint(
    actorUser: IUser,
    complaintId: string,
    input: AssignComplaintInput,
) {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);

    assertComplaintInScope(actorUser, complaint, false);
    const wasAssigned = !!complaint.assigneeId;
    if (wasAssigned && !input.transferReason?.trim()) {
        throw new HttpError("Phải nhập lý do khi chuyển người phụ trách", 422);
    }
    const primary = await User.findById(input.primaryAssigneeId).select("status");
    if (!primary || primary.status !== "active") {
        throw new HttpError("Người phụ trách chính không hợp lệ", 422);
    }
    complaint.assigneeId = input.primaryAssigneeId as any;
    complaint.secondaryAssigneeIds = [...new Set(input.secondaryAssigneeIds)] as any;
    if (input.expectedCompletionDate) {
        complaint.expectedCompletionDate = new Date(
            input.expectedCompletionDate,
        );
    }
    if (complaint.status === "moi_tiep_nhan") complaint.status = "dang_xu_ly";
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: complaint.status,
        action: wasAssigned ? "responsibility_transfer" : "assignment",
        note: wasAssigned ? input.transferReason : "Đã phân công người phụ trách chính",
        patch: { primaryAssigneeId: input.primaryAssigneeId, secondaryAssigneeIds: input.secondaryAssigneeIds },
        isPublic: true,
        actorId: actorUser._id,
    });

    await createNotification({
        title: "Bạn được giao xử lý một phản ánh",
        body: `Phản ánh ${complaint.code}: ${complaint.title}`,
        type: "complaint.assigned",
        targetUserIds: [input.primaryAssigneeId, ...input.secondaryAssigneeIds],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "complaint.assign",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { primaryAssigneeId: input.primaryAssigneeId, secondaryAssigneeIds: input.secondaryAssigneeIds, transferReason: input.transferReason },
    });

    return complaint;
}

/**
 * Mot Complaint co the co NHIEU Request lien ket qua lifetime cua no (vd:
 * dot xu ly dau tien COMPLETED, roi nguoi gui de nghi xem xet lai, tao them
 * mot dot xu ly moi) - relatedModel/relatedId tren Request von da cho phep
 * nhieu ban ghi Request cung tro ve mot Complaint, khong can doi schema. Ham
 * nay kiem tra CON Request nao lien ket toi complaintId dang "hoat dong"
 * (RequestRecipient chua "resolved") hay khong - dung de quyet dinh co the
 * tao THEM mot Request moi (qua receiveComplaint/choosePersonInCharge) hay
 * khong: tai moi thoi diem chi cho phep TOI DA MOT Request dang hoat dong
 * cho mot Complaint (tranh hai nguoi cung duoc giao xu ly cung luc), nhung
 * sau khi Request do da resolved (hoac chua tung co Request nao), co the tao
 * THEM mot Request moi - vd sau khi nguoi gui de nghi xem xet lai va phan
 * anh quay lai "dang_xu_ly".
 */
async function hasActiveLinkedRequest(
    complaintId: mongoose.Types.ObjectId | string,
): Promise<boolean> {
    const requestIds = await RequestModel.find({
        relatedModel: "Complaint",
        relatedId: complaintId,
    }).distinct("_id");
    if (requestIds.length === 0) return false;

    const activeCount = await RequestRecipient.countDocuments({
        requestId: { $in: requestIds },
        status: { $ne: "resolved" },
    });
    return activeCount > 0;
}

/**
 * Dung boi ca guard cua receiveComplaint/choosePersonInCharge LAN o
 * getComplaintDetailForOwnerOrStaff (de FE biet luc nao hien nut Tiep
 * nhan/Chon nguoi phu trach) - mot noi duy nhat dinh nghia dieu kien, tranh
 * lech giua backend enforcement va UI hien thi. Khong cho tiep nhan/chon
 * nguoi phu trach khi phan anh da ket thuc ("hoan_thanh"/"dong") hoac dang co
 * mot Request lien ket con hoat dong (xem hasActiveLinkedRequest).
 */
export async function canReceiveOrChooseAssignee(
    complaint: IComplaint,
): Promise<boolean> {
    if (complaint.status === "hoan_thanh" || complaint.status === "dong") {
        return false;
    }
    return !(await hasActiveLinkedRequest(complaint._id));
}

/**
 * Tao mot Request noi bo (type "task" - RequestType xay dung san, xem
 * REQUEST_TYPES trong @/types) lien ket toi phan anh nay (relatedModel=
 * "Complaint", relatedId=complaint._id) de nguoi phu trach theo doi/bao cao
 * tien do qua kenh Yeu cau cong viec chung, dung cho luong "Tiep nhan"/"Chon
 * nguoi phu trach" (xem receiveComplaint/choosePersonInCharge ben duoi).
 *
 * KHONG goi requestService.createRequest: ham do xac thuc nguoi nhan qua
 * resolveRecipientIds, doi hoi user thuoc mot Role dang duoc cap permission
 * "{type}.assign" (eligiblePermissionForType) - loai "task" hien CHUA co
 * permission rieng nao duoc dang ky (xem ghi chu tai REQUEST_TYPES trong
 * types/index.ts: "task" chi duoc dinh tuyen qua houseRole/
 * targetHouseNeighborhoodLeader, chua co "task.assign"), nen bat ky
 * targetUserIds nao truyen thang vao createRequest cho type "task" se LUON bi
 * tu choi (khong co role nao khop dieu kien). Nguoi nhan o day da duoc xac
 * thuc rieng boi actor (chinh actorUser, hoac assigneeUserId da qua
 * User.findById trong choosePersonInCharge) nen tao thang Request/
 * RequestRecipient, bo qua lop xac thuc do thay vi lam createRequest that bai.
 *
 * initialStatus: receiveComplaint truyen "in_progress" (nguoi tiep nhan da tu
 * nhan xu ly, khong ly do gi de Request o trang thai "moi" - dung quy uoc
 * cua PDF quy trinh: "no reason to create the Request as NEW, because the
 * creator has already accepted the work"). choosePersonInCharge truyen
 * "pending" (nguoi duoc chon con phai tu xac nhan/tiep nhan Request rieng,
 * giong luong "Assign to another person" trong PDF).
 */
async function createLinkedTaskRequest(
    actorUser: IUser,
    complaint: IComplaint,
    assigneeUserId: string,
    initialStatus: RequestStatus,
): Promise<void> {
    const request = await RequestModel.create({
        type: "task",
        title: `Xử lý phản ánh: ${complaint.title}`,
        description: `Yêu cầu xử lý phản ánh ${complaint.code}`,
        priority: "normal",
        relatedModel: "Complaint",
        relatedId: complaint._id,
        houseId: complaint.targetHouseId,
        targetRoles: [],
        createdBy: actorUser._id,
    });

    await RequestRecipient.create({
        requestId: request._id,
        userId: assigneeUserId,
        status: initialStatus,
    });

    await createNotification({
        title: request.title,
        body: `Mã ${complaint.code}: ${complaint.title}`,
        type: "request.task",
        targetUserIds: [assigneeUserId],
        relatedModel: "Request",
        relatedId: request._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "request.create",
        targetModel: "Request",
        targetId: request._id,
        metadata: {
            type: "task",
            recipientCount: 1,
            relatedModel: "Complaint",
            relatedId: complaint._id,
        },
    });
}

/**
 * Nhan vien co quyen complaints.assign (kiem tra o route, giong assignComplaint)
 * TU tiep nhan mot phan anh - tro thanh nguoi phu trach chinh CUA CHINH
 * MINH, khac voi choosePersonInCharge (chon MOT nguoi khac). Tao kem mot
 * Request noi bo (type "task") ma nguoi gui = nguoi nhan = chinh actorUser,
 * dung de actor bao cao tien do xu ly qua kenh Yeu cau cong viec chung -
 * trang thai Request nay se duoc dong bo nguoc lai Complaint.status qua
 * syncComplaintStatusFromRequest (xem requestService.updateMyRequestStatus/
 * confirmRequestRecipient).
 *
 * KHONG con gioi han chi dung duoc khi status="moi_tiep_nhan" - mot Complaint
 * co the tao NHIEU Request qua vong doi cua no (vd sau khi nguoi gui de nghi
 * xem xet lai va phan anh quay ve "dang_xu_ly"), xem canReceiveOrChooseAssignee.
 */
export async function receiveComplaint(
    actorUser: IUser,
    complaintId: string,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);
    assertComplaintInScope(actorUser, complaint, false);
    if (!(await canReceiveOrChooseAssignee(complaint))) {
        throw new HttpError(
            "Phản ánh đã kết thúc hoặc đang có yêu cầu xử lý còn hiệu lực, không thể tiếp nhận",
            409,
        );
    }

    complaint.assigneeId = actorUser._id as any;
    complaint.status = "dang_xu_ly";
    await complaint.save();

    await createLinkedTaskRequest(
        actorUser,
        complaint,
        String(actorUser._id),
        "in_progress",
    );

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: complaint.status,
        action: "assignment",
        note: "Đã tiếp nhận và trực tiếp xử lý phản ánh",
        patch: {
            primaryAssigneeId: String(actorUser._id),
            secondaryAssigneeIds: [],
        },
        isPublic: true,
        actorId: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "complaint.receive",
        targetModel: "Complaint",
        targetId: complaint._id,
    });

    return complaint;
}

/**
 * Nhan vien co quyen complaints.assign chon MOT nguoi khac lam nguoi phu
 * trach chinh cho mot phan anh - khac receiveComplaint (tu tiep nhan) va
 * assignComplaint (tai phan cong/chuyen trach nhiem cho Request DANG hoat
 * dong, van giu nguyen khong doi). Cung tao kem mot Request noi bo (type
 * "task") nhung nguoi nhan la assigneeUserId, nguoi tao (createdBy) van la
 * actorUser (nguoi thuc hien chon, khong phai nguoi duoc chon).
 *
 * KHONG con gioi han chi dung duoc khi status="moi_tiep_nhan" - xem ghi chu
 * o receiveComplaint/canReceiveOrChooseAssignee.
 */
export async function choosePersonInCharge(
    actorUser: IUser,
    complaintId: string,
    assigneeUserId: string,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);
    assertComplaintInScope(actorUser, complaint, false);
    if (!(await canReceiveOrChooseAssignee(complaint))) {
        throw new HttpError(
            "Phản ánh đã kết thúc hoặc đang có yêu cầu xử lý còn hiệu lực, không thể chọn người phụ trách",
            409,
        );
    }

    // Cung quy uoc xac thuc voi assignComplaint: nguoi duoc chon phai la mot
    // User dang active.
    const assignee = await User.findById(assigneeUserId).select("status");
    if (!assignee || assignee.status !== "active") {
        throw new HttpError("Người phụ trách chính không hợp lệ", 422);
    }

    complaint.assigneeId = assigneeUserId as any;
    complaint.status = "dang_xu_ly";
    await complaint.save();

    await createLinkedTaskRequest(
        actorUser,
        complaint,
        assigneeUserId,
        "pending",
    );

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: complaint.status,
        action: "assignment",
        note: "Đã chọn người phụ trách chính",
        patch: { primaryAssigneeId: assigneeUserId, secondaryAssigneeIds: [] },
        isPublic: true,
        actorId: actorUser._id,
    });

    await createNotification({
        title: "Bạn được giao xử lý một phản ánh",
        body: `Phản ánh ${complaint.code}: ${complaint.title}`,
        type: "complaint.assigned",
        targetUserIds: [assigneeUserId],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "complaint.choose_assignee",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { assigneeUserId },
    });

    return complaint;
}

/**
 * Nhan vien co quyen complaints.assign yeu cau nguoi gui bo sung thong tin
 * cho mot phan anh CON dang "moi_tiep_nhan" - dung TRUOC khi tiep nhan/chon
 * nguoi phu trach (khac voi luong bo sung thong tin GIUA CHUNG xu ly, xem
 * requestService.updateMyRequestStatus voi "needs_info" -> syncComplaintStatusFromRequest
 * o duoi, danh cho nguoi phu trach CHINH da duoc giao). Bat buoc phai neu ro
 * NOI DUNG can bo sung (content) de nguoi gui biet can cung cap gi - luu lam
 * note cua ComplaintTimeline (cung la thong bao gui toi nguoi gui). Nguoi gui
 * sau do tu sua phan anh (updateComplaint) de bo sung, tu dong dua phan anh
 * ve "dang_xu_ly" (xem quy uoc can_bo_sung -> dang_xu_ly khi nguoi gui sua o
 * updateComplaint).
 */
export async function requestComplaintInfo(
    actorUser: IUser,
    complaintId: string,
    input: RequestComplaintInfoInput,
): Promise<IComplaint> {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) throw new HttpError("Không tìm thấy phản ánh", 404);
    assertComplaintInScope(actorUser, complaint, false);
    if (complaint.status !== "moi_tiep_nhan") {
        throw new HttpError("Phản ánh không ở trạng thái mới tiếp nhận", 409);
    }

    const content = input.content.trim();
    if (!content) {
        throw new HttpError("Vui lòng nhập thông tin cần bổ sung", 422);
    }

    complaint.status = "can_bo_sung";
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: complaint.status,
        note: content,
        isPublic: true,
        actorId: actorUser._id,
    });

    await createNotification({
        title: "Yêu cầu bổ sung thông tin phản ánh",
        body: `Phản ánh ${complaint.code}: ${content}`,
        type: "complaint.status_changed",
        targetUserIds: [complaint.createdByUserId],
        relatedModel: "Complaint",
        relatedId: complaint._id,
        createdBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "complaint.request_info",
        targetModel: "Complaint",
        targetId: complaint._id,
        metadata: { content },
    });

    return complaint;
}

// Anh xa trang thai RequestRecipient -> Complaint.status, dung boi
// syncComplaintStatusFromRequest. KHONG BAO GIO anh xa toi "hoan_thanh" - do
// la bat bien cung, trang thai do CHI nguoi gui phan anh tu xac nhan qua
// confirmComplaintResolution. "pending" ("Moi tiep nhan" o Request) VAN anh xa
// ve "dang_xu_ly": ke tu khi choosePersonInCharge tao Request voi
// initialStatus="pending" (nguoi duoc chon chua tu xac nhan Request), phan
// anh van duoc coi la dang duoc xu ly tu goc do nguoi gui (da co nguoi phu
// trach chinh), du Request noi bo van cho nguoi do bam nhan.
const COMPLAINT_STATUS_SYNC_MAP: Partial<Record<RequestStatus, TrangThaiPhanAnh>> = {
    pending: "dang_xu_ly",
    acknowledged: "dang_xu_ly",
    in_progress: "dang_xu_ly",
    needs_info: "can_bo_sung",
    awaiting_confirmation: "da_xu_ly",
    resolved: "da_xu_ly",
};

// Thu tu "tien" cua cac trang thai ma dong bo co the dat - dung de dam bao
// dong bo chi di TOI, khong lui (vd Request tu "resolved" -> "in_progress" do
// nguoi quan ly tu choi xac nhan, khong duoc keo Complaint tu da_xu_ly lui ve
// dang_xu_ly). "moi_tiep_nhan"/"hoan_thanh"/"dong" khong co mat: hai trang
// thai sau la ket thuc (chan rieng ben duoi, khong bao gio toi day), con
// moi_tiep_nhan la trang thai truoc khi co Request lien ket nen coi nhu hang 0.
const SYNC_STATUS_RANK: Partial<Record<TrangThaiPhanAnh, number>> = {
    can_bo_sung: 1,
    dang_xu_ly: 1,
    da_xu_ly: 2,
};

/**
 * Dong bo MOT CHIEU: trang thai cua RequestRecipient (thuoc mot Request lien
 * ket toi Complaint qua relatedModel/relatedId) -> Complaint.status. Goi sau
 * khi requestService.updateMyRequestStatus/confirmRequestRecipient luu trang
 * thai moi cho mot recipient cua Request do.
 *
 * Bat bien cung: KHONG BAO GIO dat "hoan_thanh" (chi dat duoc qua
 * confirmComplaintResolution, do chinh nguoi gui phan anh tu xac nhan) va
 * khong dong khi phan anh da "hoan_thanh"/"dong" (trang thai ket thuc, do
 * nguoi gui/nhan vien chu dong dieu khien rieng - dong bo tu dong tuyet doi
 * khong duoc ghi de). Cung khong lui trang thai (xem SYNC_STATUS_RANK).
 */
export async function syncComplaintStatusFromRequest(
    complaintId: string,
    recipientStatus: RequestStatus,
): Promise<void> {
    const mapped = COMPLAINT_STATUS_SYNC_MAP[recipientStatus];
    if (!mapped) return;

    const complaint = await Complaint.findById(complaintId).select(
        "status assigneeId createdByUserId code",
    );
    if (!complaint) return;
    if (complaint.status === "hoan_thanh" || complaint.status === "dong") return;
    if (complaint.status === mapped) return;

    const currentRank = SYNC_STATUS_RANK[complaint.status] ?? 0;
    const nextRank = SYNC_STATUS_RANK[mapped] ?? 0;
    if (nextRank < currentRank) return;

    complaint.status = mapped;
    await complaint.save();

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: mapped,
        action: "status_update",
        note: "Tự động cập nhật theo tiến độ xử lý của yêu cầu liên kết (đồng bộ hệ thống)",
        isPublic: true,
        actorId: complaint.assigneeId || complaint.createdByUserId,
    });
}
