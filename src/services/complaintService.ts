import type mongoose from "mongoose";
import {
    Complaint,
    ComplaintTimeline,
    Household,
    Citizen,
    HouseRecord,
    Neighborhood,
    NeighborhoodColeaderAssignment,
    User,
    type IComplaint,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateYearlyCode } from "@/lib/utils";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { areaScopeFilter } from "@/lib/rbac";
import { getHouseIdsForActingOwner } from "@/services/houseOwnershipService";
import { getSetting } from "@/services/settingsService";
import { TRANG_THAI_PHAN_ANH_LABEL } from "@/types";
import type {
    AssignComplaintInput,
    CreateComplaintInput,
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
function complaintScopeFilter(
    actorUser: IUser,
    canReadEscalated: boolean,
): Record<string, unknown> {
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
    return areaScopeFilter(actorUser);
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
            "Ban khong co quyen xem phan anh nay (ngoai pham vi phu trach)",
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
                "Ban khong co quyen xem phan anh nay (ngoai pham vi phu trach)",
                403,
            );
        }
        return;
    }

    if (!clusters.length) return;
    if (complaint.cluster && !clusters.includes(complaint.cluster)) {
        throw new HttpError(
            "Ban khong co quyen xem phan anh nay (ngoai pham vi phu trach)",
            403,
        );
    }
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
            throw new HttpError("Khong tim thay nha so duoc chon", 404);
        }
        targetHouseId = targetHouse._id as mongoose.Types.ObjectId;
        neighborhoodId = targetHouse.neighborhoodId;
        cluster = targetHouse.cluster;
    } else {
        cluster = await resolveComplaintCluster(actorUser);
        neighborhoodId = await resolveComplaintNeighborhoodId(actorUser);
    }
    const wardCode = await resolveComplaintWardCode(actorUser, neighborhoodId);
    // Chi khi nguoi gui CHU DONG chon nha so, tu dong giao To truong cua to
    // dan pho chua nha do lam nguoi phu trach chinh. Neu khong chon nha, cap
    // phuong nhan thong bao nhung phan anh van chua co nguoi phu trach.
    const targetNeighborhood = input.houseId && neighborhoodId
        ? await Neighborhood.findById(neighborhoodId).select("leaderUserId")
        : null;
    const primaryAssigneeId = targetNeighborhood?.leaderUserId;
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
        assigneeId: primaryAssigneeId,
    });

    await ComplaintTimeline.create({
        complaintId: complaint._id,
        status: "moi_tiep_nhan",
        note: "Phản ánh đã được tiếp nhận từ Mini App",
        isPublic: true,
        actorId: userId,
    });

    if (primaryAssigneeId) {
        await ComplaintTimeline.create({
            complaintId: complaint._id,
            status: complaint.status,
            action: "assignment",
            note: "Tự động giao Tổ trưởng của nhà số được chọn làm người phụ trách chính",
            patch: { primaryAssigneeId: String(primaryAssigneeId), secondaryAssigneeIds: [] },
            isPublic: true,
            actorId: userId,
        });
    }

    // Neu xac dinh duoc to dan pho, chi bao To truong/To pho CUA TO DO (khong
    // blast toi moi neighborhood_leader trong he thong nhu truoc). Neu khong
    // xac dinh duoc, day chinh la truong hop can chuyen tiep len cap Phuong -
    // bao bi thu/can bo UBND thay vi de phan anh "mat tich".
    if (neighborhoodId) {
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
    allowedCategories?: string[] | null;
    actorUser: IUser;
    canReadEscalated: boolean;
}) {
    const clauses: Record<string, unknown>[] = [];
    if (params.status) clauses.push({ status: params.status });
    if (params.relatedAssetId) {
        clauses.push({ relatedAssetId: params.relatedAssetId });
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
    const scope = complaintScopeFilter(params.actorUser, params.canReadEscalated);
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
            .populate("targetHouseId", "code address"),
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
        throw new HttpError("Ban khong co quyen xem phan anh nay", 403);
    }
    if (
        requester.isStaff &&
        !isOwner &&
        requester.allowedCategories &&
        !requester.allowedCategories.includes(complaint.category)
    ) {
        throw new HttpError("Ban khong co quyen xem nhom phan anh nay", 403);
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
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    assertComplaintReadable(complaint, requester);

    const timeline = await getTimelineFor(complaintId, !requester.isStaff);
    const plain = complaint.toObject();
    if (!requester.isStaff) delete (plain as any).internalNotes;

    return { complaint: plain, timeline };
}

export async function getComplaintByCode(code: string) {
    const complaint = await Complaint.findOne({ code }).populate(
        "createdByUserId",
        "displayName",
    );
    if (!complaint)
        throw new HttpError("Khong tim thay phan anh voi ma nay", 404);
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
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    // "hoan_thanh" la nguoi gui phan anh TU XAC NHAN hai long - nhan vien
    // khong duoc dat trang thai nay thay ho, xem confirmComplaintResolution.
    if (input.status === "hoan_thanh") {
        throw new HttpError(
            "Trang thai nay chi nguoi gui phan anh moi duoc xac nhan",
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
            "Chi nguoi gui phan anh nay moi duoc thuc hien hanh dong nay",
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
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    if (
        !actorUser.roles.includes("admin") &&
        String(complaint.createdByUserId) !== String(actorUser._id)
    ) {
        throw new HttpError("Ban khong co quyen sua phan anh nay", 403);
    }
    if (complaint.status === "dong" || complaint.status === "hoan_thanh") {
        throw new HttpError(
            "Phan anh da ket thuc, khong the chinh sua noi dung",
            400,
        );
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
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);
    assertIsComplaintSender(complaint, actorUser);
    if (complaint.status !== "da_xu_ly") {
        throw new HttpError(
            "Chi xac nhan hoan thanh khi phan anh da duoc xu ly",
            400,
        );
    }
    if (
        input?.rating !== undefined &&
        (input.rating < 1 || input.rating > 5)
    ) {
        throw new HttpError("Danh gia phai tu 1 den 5 sao", 400);
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
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);
    assertIsComplaintSender(complaint, actorUser);
    if (complaint.status !== "da_xu_ly") {
        throw new HttpError(
            "Chi de nghi xem xet lai khi phan anh da duoc xu ly",
            400,
        );
    }
    const usedCount = await ComplaintTimeline.countDocuments({
        complaintId: complaint._id,
        action: "reevaluation_request",
    });
    if (usedCount > 0) {
        throw new HttpError(
            "Phan anh nay da duoc de nghi xem xet lai truoc do, khong the gui them",
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
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

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
    if (!complaint) throw new HttpError("Khong tim thay phan anh", 404);

    assertComplaintInScope(actorUser, complaint, false);
    const wasAssigned = !!complaint.assigneeId;
    if (wasAssigned && !input.transferReason?.trim()) {
        throw new HttpError("Phai nhap ly do khi chuyen nguoi phu trach", 422);
    }
    const primary = await User.findById(input.primaryAssigneeId).select("status");
    if (!primary || primary.status !== "active") {
        throw new HttpError("Nguoi phu trach chinh khong hop le", 422);
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
