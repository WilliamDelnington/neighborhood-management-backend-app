import ExcelJS from "exceljs";
import {
    HouseRecord,
    Neighborhood,
    NeighborhoodHistory,
    Role,
    ScopeAssignment,
    FileAsset,
    InspectionCampaign,
    InspectionTarget,
    User,
    type INeighborhood,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { isCollaboratorOrLegacyCooperator } from "@/lib/systemRoles";
import { addTableSheet } from "@/lib/excelResponse";
import type {
    CreateNeighborhoodInput,
    AssignNeighborhoodCollaboratorInput,
    UpdateNeighborhoodInput,
} from "@/validators/neighborhood";
import type { NeighborhoodStatus } from "@/models/Neighborhood";

const LEADER_POPULATE = "displayName phone status avatarUrl";

/**
 * Ket thuc cac phan cong CONG TAC VIEN da qua han (endAt rieng cua tung phan
 * cong, KHONG lien quan den nhiem ky - xem models/ScopeAssignment.ts)
 * va dong bo lai scope tren User. To truong/To pho KHONG con o day nua - sau
 * khi bo khai niem nhiem ky (nhiem ky/khoang thoi gian), phan cong To truong/
 * To pho la "active cho den khi duoc go tay" (giong quy uoc gan Bi thu cap
 * Phuong), khong con endAt de tu dong het han.
 */
export async function expireNeighborhoodOfficerAssignments(userId?: string) {
    const now = new Date();
    const collaboratorFilter = userId ? { userId } : {};
    const expiredCollaborators = await ScopeAssignment.find({
        ...collaboratorFilter,
        roleKey: "neighborhood_collaborator",
        scopeType: "NEIGHBORHOOD",
        unassignedAt: { $exists: false },
        endAt: { $lt: now },
    });
    for (const assignment of expiredCollaborators) {
        assignment.unassignedAt = assignment.endAt || now;
        await assignment.save();
        const remaining = await ScopeAssignment.exists({
            roleKey: "neighborhood_collaborator",
            scopeType: "NEIGHBORHOOD",
            scopeId: assignment.scopeId,
            userId: assignment.userId,
            unassignedAt: { $exists: false },
        });
        if (!remaining) {
            await User.updateOne(
                { _id: assignment.userId },
                { $pull: { assignedNeighborhoodIds: assignment.scopeId } },
            );
        }
    }

    return expiredCollaborators.length;
}

/**
 * Tra ve danh sach id to dan pho ma user duoc phep xem khi KHONG phai admin:
 * to dan pho chinh (neighborhoodId) hop voi cac to dan pho phu (assignedNeighborhoodIds).
 */
function ownNeighborhoodIds(user: IUser): string[] {
    const ids = [
        user.neighborhoodId,
        ...(user.assignedNeighborhoodIds || []),
    ].filter(Boolean);
    return ids.map(id => String(id));
}

function isWardScoped(user: IUser): boolean {
    return (
        user.roles.includes("secretary") ||
        user.roles.includes("people_committee_official")
    );
}

export async function listNeighborhoods(params: {
    page: number;
    limit: number;
    search?: string;
    active?: boolean;
    status?: NeighborhoodStatus;
    streetId?: string;
    leaderUserId?: string;
    filterLeaderUserId?: string;
    actorUser: IUser;
}) {
    await expireNeighborhoodOfficerAssignments();
    const filter: Record<string, unknown> = {};

    if (params.leaderUserId) {
        // Dung cho man quan ly nguoi dung (admin xem "to dan pho nao user X
        // dang phu trach") - CHI admin duoc dung tham so nay, tranh mot
        // neighborhood_leader tu truy van pham vi cua nguoi dung khac.
        if (!params.actorUser.roles.includes("admin")) {
            throw new HttpError("Bạn không có quyền thực hiện thao tác này", 403);
        }
        const targetUser = await User.findById(params.leaderUserId).select(
            "neighborhoodId assignedNeighborhoodIds",
        );
        if (!targetUser) throw new HttpError("Không tìm thấy người dùng", 404);
        const ids = [
            targetUser.neighborhoodId,
            ...(targetUser.assignedNeighborhoodIds || []),
        ].filter(Boolean);
        filter._id = { $in: ids };
    } else if (
        !params.actorUser.roles.includes("admin") &&
        isWardScoped(params.actorUser)
    ) {
        // Bi thu va can bo UBND chi duoc thay cac to dan pho trong phuong/xa
        // duoc gan tren tai khoan. Khong co wardCode thi tra ve danh sach rong,
        // khong duoc mac dinh thanh toan he thong.
        filter.wardCode = params.actorUser.wardCode ?? { $in: [] };
    } else if (
        params.actorUser.roles.includes("neighborhood_leader") ||
        params.actorUser.roles.includes("neighborhood_coleader")
    ) {
        // To truong (neighborhood_leader) va To pho (neighborhood_coleader) bi
        // gioi han ve to dan pho minh phu trach. Cac vai tro khac co quyen
        // neighborhoods.read nhung khong
        // co khai niem "to dan pho cua minh" (vd house_owner chon to dan pho
        // luc tao nha) can thay toan bo danh sach dang active, giong nhu
        // streetService.listStreets khong co scoping nao ca.
        const ids = ownNeighborhoodIds(params.actorUser);
        filter._id = { $in: ids };
    }

    if (params.status) {
        // Ban ghi cu co the chua co status; ACTIVE/INACTIVE duoc suy ra tu active.
        filter.$and = [
            ...((filter.$and as unknown[]) || []),
            params.status === "ACTIVE"
                ? { $or: [{ status: "ACTIVE" }, { status: { $exists: false }, active: true }] }
                : params.status === "INACTIVE"
                  ? { $or: [{ status: "INACTIVE" }, { status: { $exists: false }, active: false }] }
                  : { status: params.status },
        ];
    } else if (params.active !== undefined) {
        filter.active = params.active;
    }
    if (params.streetId) filter.streetIds = params.streetId;
    if (params.filterLeaderUserId) filter.leaderUserId = params.filterLeaderUserId;
    if (params.search) {
        filter.$or = [
            { name: { $regex: params.search, $options: "i" } },
            { code: { $regex: params.search, $options: "i" } },
        ];
    }

    const [items, total] = await Promise.all([
        Neighborhood.find(filter)
            .sort({ sequence: 1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("leaderUserId", LEADER_POPULATE)
            .populate("streetIds", "name code active"),
        Neighborhood.countDocuments(filter),
    ]);

    // Mot truy van gop cho ca trang, khong truy van rieng tung to dan pho -
    // tranh N+1 khi hien thi so nha tren danh sach.
    const ids = items.map(n => n._id);
    const [houseCounts, coleaderAssignments, attachmentCounts] = items.length
        ? await Promise.all([
          HouseRecord.aggregate([
              { $match: { neighborhoodId: { $in: items.map(n => n._id) } } },
              { $group: { _id: "$neighborhoodId", count: { $sum: 1 } } },
          ]),
          ScopeAssignment.find({
              roleKey: "neighborhood_coleader",
              scopeType: "NEIGHBORHOOD",
              // scopeId la Mixed - luon luu duoi dang string cho pham vi
              // NEIGHBORHOOD (xem assignNeighborhoodColeader), nen phai ep
              // ve string o day, khong the so sanh truc tiep voi ObjectId
              // tra ve tu Neighborhood.find (Mixed khong tu dong cast).
              scopeId: { $in: ids.map(String) },
              unassignedAt: { $exists: false },
          }).populate("userId", LEADER_POPULATE),
          FileAsset.aggregate([
              { $match: { relatedModel: "Neighborhood", relatedId: { $in: ids } } },
              { $group: { _id: "$relatedId", count: { $sum: 1 } } },
          ]),
        ])
        : [[], [], []];
    const houseCountById = new Map<string, number>(
        houseCounts.map(h => [String(h._id), h.count as number]),
    );
    const coleadersById = new Map<string, unknown[]>();
    for (const assignment of coleaderAssignments) {
        const key = String(assignment.scopeId);
        coleadersById.set(key, [
            ...(coleadersById.get(key) || []),
            assignment.userId,
        ]);
    }
    const attachmentCountById = new Map<string, number>(
        attachmentCounts.map(item => [String(item._id), item.count as number]),
    );

    const itemsWithHouseCount = items.map(n => ({
        ...n.toObject(),
        status: n.status || (n.active ? "ACTIVE" : "INACTIVE"),
        houseCount: houseCountById.get(String(n._id)) || 0,
        coleaders: coleadersById.get(String(n._id)) || [],
        attachmentCount: attachmentCountById.get(String(n._id)) || 0,
    }));

    return {
        items: itemsWithHouseCount,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

function assertNeighborhoodInScope(user: IUser, neighborhood: INeighborhood): void {
    if (user.roles.includes("admin")) return;
    if (isWardScoped(user)) {
        if (!user.wardCode || neighborhood.wardCode !== user.wardCode) {
            throw new HttpError("Bạn không có quyền xem tổ dân phố này", 403);
        }
        return;
    }
    // To truong/To pho bi gioi han ve to dan pho minh phu trach - dung HET
    // dieu kien voi listNeighborhoods (xem comment o do).
    if (
        !user.roles.includes("neighborhood_leader") &&
        !user.roles.includes("neighborhood_coleader")
    ) {
        return;
    }
    if (!ownNeighborhoodIds(user).includes(String(neighborhood._id))) {
        throw new HttpError(
            "Bạn không có quyền xem tổ dân phố này",
            403,
        );
    }
}

export async function getNeighborhoodById(
    id: string,
    actorUser: IUser,
): Promise<Record<string, unknown>> {
    await expireNeighborhoodOfficerAssignments();
    const neighborhood = await Neighborhood.findById(id)
        .populate("leaderUserId", LEADER_POPULATE)
        .populate("streetIds", "name code active");
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    assertNeighborhoodInScope(actorUser, neighborhood);
    const [houseCount, coleaders, attachmentCount] = await Promise.all([
        HouseRecord.countDocuments({ neighborhoodId: neighborhood._id }),
        listColeaders(id),
        FileAsset.countDocuments({ relatedModel: "Neighborhood", relatedId: id }),
    ]);
    return {
        ...neighborhood.toObject(),
        status: neighborhood.status || (neighborhood.active ? "ACTIVE" : "INACTIVE"),
        houseCount,
        coleaders,
        attachmentCount,
    };
}

export async function createNeighborhood(
    actorId: string,
    input: CreateNeighborhoodInput,
): Promise<INeighborhood> {
    const existing = await Neighborhood.findOne({
        $or: [
            { code: input.code, wardCode: input.wardCode },
            { sequence: input.sequence },
        ],
    });
    if (existing) {
        throw new HttpError(
            "Mã tổ trong Phường/Xã hoặc số thứ tự đã tồn tại",
            409,
        );
    }

    const neighborhood = await Neighborhood.create({
        ...input,
        active: input.status ? input.status === "ACTIVE" : input.active,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "neighborhood.create",
        targetModel: "Neighborhood",
        targetId: neighborhood._id,
        metadata: { code: neighborhood.code, name: neighborhood.name },
    });
    await NeighborhoodHistory.create({
        neighborhoodId: neighborhood._id,
        actorId,
        action: "CREATED",
        after: neighborhood.toObject(),
    });

    return neighborhood;
}

export async function updateNeighborhood(
    actorId: string,
    id: string,
    patch: UpdateNeighborhoodInput,
): Promise<INeighborhood> {
    const neighborhood = await Neighborhood.findById(id);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    const priorState = neighborhood.toObject();
    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (neighborhood as unknown as Record<string, unknown>)[key] = value;
        }
    }
    // Nguoi dung bam "Xóa" ranh giới GeoJSON tren form Sua To dan pho gui
    // boundaryType KHAC GEOJSON kem geometry:undefined - vong lap tren BO QUA
    // gan lai geometry vi gia tri la undefined (quy uoc chung: undefined =
    // "khong dong den truong nay"), khien du lieu GIS cu "dinh" lai sau khi
    // luu. Phai xoa geometry rieng moi khi boundaryType chuyen sang khac
    // GEOJSON - day la tin hieu DUY NHAT phan biet duoc voi "khong dong den
    // truong nay" qua PATCH thong thuong (xem GeoJsonBoundaryInput.tsx/
    // toUpdateNeighborhoodInput o frontend).
    if (patch.boundaryType !== undefined && patch.boundaryType !== "GEOJSON") {
        neighborhood.geometry = undefined;
    }
    if (patch.status !== undefined) neighborhood.active = patch.status === "ACTIVE";
    else if (patch.active !== undefined) {
        neighborhood.status = patch.active ? "ACTIVE" : "INACTIVE";
    }
    if (
        neighborhood.effectiveFrom &&
        neighborhood.effectiveTo &&
        neighborhood.effectiveTo < neighborhood.effectiveFrom
    ) {
        throw new HttpError("Ngày kết thúc hiệu lực phải sau ngày bắt đầu", 422);
    }
    neighborhood.updatedBy = actorId as any;
    await neighborhood.save();

    await writeAuditLog({
        actorId,
        action: "neighborhood.update",
        targetModel: "Neighborhood",
        targetId: neighborhood._id,
        metadata: { before: priorState, after: patch },
    });
    await NeighborhoodHistory.create({
        neighborhoodId: neighborhood._id,
        actorId,
        action: priorState.status !== neighborhood.status ? "STATUS_CHANGED" : "UPDATED",
        before: priorState,
        after: neighborhood.toObject(),
    });

    return neighborhood;
}

/**
 * Gan hoac go to truong cua mot to dan pho. Chinh sach mac dinh: mot to truong
 * chi duoc phu trach MOT to dan pho tai mot thoi diem - neu leaderUserId dang
 * la to truong active cua to khac, ban ghi phan cong cu do se duoc dong lai
 * (chuyen to truong) thay vi bi tu choi. Khong dung Mongo transaction (dong
 * bo voi phan con lai cua codebase - vd assignRole/revokeRole trong userService.ts).
 */
export async function assignNeighborhoodLeader(
    actorId: string,
    neighborhoodId: string,
    leaderUserId: string | null,
    note?: string,
): Promise<INeighborhood> {
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    const currentLeaderId = neighborhood.leaderUserId
        ? String(neighborhood.leaderUserId)
        : null;

    if (currentLeaderId === leaderUserId) {
        return neighborhood;
    }

    let newLeader: IUser | null = null;
    if (leaderUserId) {
        newLeader = await User.findById(leaderUserId);
        if (!newLeader) throw new HttpError("Không tìm thấy người dùng", 404);
        if (newLeader.status !== "active") {
            throw new HttpError(
                "Chỉ có thể gán tài khoản đang hoạt động làm tổ trưởng",
                422,
            );
        }
        if (!newLeader.roles.includes("neighborhood_leader")) {
            throw new HttpError(
                "Người dùng được chọn phải có vai trò Tổ trưởng",
                422,
            );
        }
    }

    const now = new Date();

    // 1) Dong phan cong dang active hien tai cua CHINH to dan pho nay (neu co).
    // Chinh sach mac dinh (1 to truong = 1 to dan pho) nen chi can go lien ket
    // to dan pho nay khoi ca neighborhoodId (chinh) lan assignedNeighborhoodIds
    // (phu) cua nguoi dung do, khong can phan biet chinh/phu.
    // Giu lai assignedAt cua phan cong sap dong de ghi vao NeighborhoodHistory
    // ben duoi (metadata.assignedAt) - cho phep hien thi khoang thoi gian day
    // du "tu ngay -> den ngay" thay vi chi mot moc thoi gian ket thuc.
    let closedLeaderAssignedAt: Date | undefined;
    if (currentLeaderId) {
        const closedLeaderAssignment = await ScopeAssignment.findOneAndUpdate(
            {
                roleKey: "neighborhood_leader",
                scopeType: "NEIGHBORHOOD",
                scopeId: String(neighborhood._id),
                unassignedAt: { $exists: false },
            },
            { unassignedAt: now, unassignedBy: actorId },
        ).select("assignedAt");
        closedLeaderAssignedAt = closedLeaderAssignment?.assignedAt;
        await User.updateOne(
            { _id: currentLeaderId, neighborhoodId: neighborhood._id },
            { $unset: { neighborhoodId: "" } },
        );
        await User.findByIdAndUpdate(currentLeaderId, {
            $pull: { assignedNeighborhoodIds: neighborhood._id },
        });
    }

    if (!leaderUserId) {
        neighborhood.leaderUserId = undefined as any;
        neighborhood.updatedBy = actorId as any;
        await neighborhood.save();

        await writeAuditLog({
            actorId,
            action: "neighborhood.leader_assign",
            targetModel: "Neighborhood",
            targetId: neighborhood._id,
            metadata: { from: currentLeaderId, to: null },
        });
        await NeighborhoodHistory.create({
            neighborhoodId: neighborhood._id,
            actorId,
            action: "LEADER_UNASSIGNED",
            metadata: {
                leaderUserId: currentLeaderId,
                assignedAt: closedLeaderAssignedAt,
                unassignedAt: now,
            },
        });

        return neighborhood;
    }

    // 2) Neu to truong moi dang la to truong active o mot to dan pho KHAC, tu
    // dong dong phan cong do (chuyen to truong) - mot nguoi chi lam to truong
    // MOT noi tai mot thoi diem, khong con khai niem nhiem ky/khoang thoi gian
    // de cho phep song song o hai noi nhu truoc.
    const otherActiveAssignment = await ScopeAssignment.findOne({
        roleKey: "neighborhood_leader",
        scopeType: "NEIGHBORHOOD",
        userId: leaderUserId,
        scopeId: { $ne: String(neighborhood._id) },
        unassignedAt: { $exists: false },
    });
    if (otherActiveAssignment) {
        otherActiveAssignment.unassignedAt = now;
        otherActiveAssignment.unassignedBy = actorId as any;
        await otherActiveAssignment.save();
        await Neighborhood.updateOne(
            { _id: otherActiveAssignment.scopeId, leaderUserId },
            { $unset: { leaderUserId: "" } },
        );
        await User.updateOne(
            { _id: leaderUserId, neighborhoodId: otherActiveAssignment.scopeId },
            { $unset: { neighborhoodId: "" } },
        );
        await User.updateOne(
            { _id: leaderUserId },
            { $pull: { assignedNeighborhoodIds: otherActiveAssignment.scopeId } },
        );
    }

    await ScopeAssignment.create({
        roleKey: "neighborhood_leader",
        scopeType: "NEIGHBORHOOD",
        scopeId: String(neighborhood._id),
        userId: leaderUserId,
        assignedBy: actorId,
        assignedAt: now,
        note,
    });

    neighborhood.leaderUserId = leaderUserId as any;
    neighborhood.updatedBy = actorId as any;
    await neighborhood.save();

    await User.findByIdAndUpdate(leaderUserId, {
        neighborhoodId: neighborhood._id,
        $addToSet: { assignedNeighborhoodIds: neighborhood._id },
    });

    await writeAuditLog({
        actorId,
        action: "neighborhood.leader_assign",
        targetModel: "Neighborhood",
        targetId: neighborhood._id,
        metadata: { from: currentLeaderId, to: leaderUserId },
    });
    await NeighborhoodHistory.create({
        neighborhoodId: neighborhood._id,
        actorId,
        action: "LEADER_ASSIGNED",
        metadata: { leaderUserId },
    });

    return await neighborhood.populate("leaderUserId", LEADER_POPULATE);
}

export async function getLeaderHistory(neighborhoodId: string) {
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    return ScopeAssignment.find({
        roleKey: "neighborhood_leader",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
    })
        .sort({ assignedAt: -1 })
        .populate("userId", LEADER_POPULATE)
        .populate("assignedBy", "displayName")
        .populate("unassignedBy", "displayName");
}

/**
 * Danh sach To pho dang hoat dong cua mot to dan pho. Khac To truong: khong
 * denormalize len Neighborhood - doc truc tiep tu ScopeAssignment
 * (roleKey="neighborhood_coleader").
 */
export async function listColeaders(neighborhoodId: string) {
    await expireNeighborhoodOfficerAssignments();
    return ScopeAssignment.find({
        roleKey: "neighborhood_coleader",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        unassignedAt: { $exists: false },
    })
        .sort({ assignedAt: -1 })
        .populate("userId", LEADER_POPULATE)
        .populate("assignedBy", "displayName");
}

/**
 * Tra ve userId cua To truong + cac To pho DANG HOAT DONG cua mot to dan pho -
 * dung chung boi bat ky noi nao can "bao cho lanh dao To" (Complaint,
 * Request...). Truoc day co 3 ban sao gan giong nhau: 2 cho inline trong
 * complaintService.ts va 1 rieng (resolveHouseLeaderRecipientIds) trong
 * requestService.ts - gop lai day, cac noi do goi ham nay thay vi tu truy van.
 */
export async function getNeighborhoodLeadershipUserIds(
    neighborhoodId: unknown,
): Promise<Set<string>> {
    const ids = new Set<string>();
    const neighborhood = await Neighborhood.findById(neighborhoodId).select(
        "leaderUserId",
    );
    if (neighborhood?.leaderUserId) ids.add(String(neighborhood.leaderUserId));

    const coleaderAssignments = await ScopeAssignment.find({
        roleKey: "neighborhood_coleader",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        unassignedAt: { $exists: false },
    }).select("userId");
    coleaderAssignments.forEach(a => ids.add(String(a.userId)));

    return ids;
}

const MANAGEMENT_ROLE_KEYS = [
    "neighborhood_leader",
    "neighborhood_coleader",
    "neighborhood_collaborator",
];

/**
 * Toan bo lich su dam nhiem To truong/To pho/Cong tac vien cua MOT nguoi dung,
 * xuyen suot moi to dan pho (khong chi mot to) - dung cho phan "Lịch sử quản
 * lý Tổ dân phố" tren ho so Nguoi dung (UserDetailPage.tsx), doi xung voi
 * getLeaderHistory/getColeaderHistory/getCollaboratorHistory (xem theo mot to
 * dan pho cu the). Tra kem ten to dan pho vi mot nguoi co the tung phu trach
 * nhieu to khac nhau qua thoi gian.
 */
export async function getUserNeighborhoodManagementHistory(userId: string) {
    const rows = await ScopeAssignment.find({
        userId,
        scopeType: "NEIGHBORHOOD",
        roleKey: { $in: MANAGEMENT_ROLE_KEYS },
    })
        .sort({ assignedAt: -1 })
        .populate("assignedBy", "displayName")
        .populate("unassignedBy", "displayName");

    const neighborhoodIds = [
        ...new Set(rows.map(r => String(r.scopeId))),
    ];
    const neighborhoods = await Neighborhood.find({
        _id: { $in: neighborhoodIds },
    }).select("name code");
    const neighborhoodById = new Map(
        neighborhoods.map(n => [String(n._id), n]),
    );

    return rows.map(r => ({
        _id: String(r._id),
        roleKey: r.roleKey,
        neighborhood: neighborhoodById.get(String(r.scopeId)) || null,
        assignedAt: r.assignedAt,
        assignedBy: r.assignedBy,
        unassignedAt: r.unassignedAt,
        unassignedBy: r.unassignedBy,
        endAt: r.endAt,
        note: r.note,
    }));
}

/**
 * Gan mot nguoi lam To pho cua mot to dan pho. Khac assignNeighborhoodLeader:
 * khong co logic "1 nguoi 1 to" o cap to dan pho (nhieu to pho cung luc duoc),
 * nhung van gioi han 1 nguoi khong the la to pho active o 2 to KHAC nhau cung
 * luc (xem unique index tren model) - neu dang la to pho o to khac, tu choi
 * thay vi tu dong chuyen (khac chinh sach cua to truong).
 */
export async function assignNeighborhoodColeader(
    actorId: string,
    neighborhoodId: string,
    coleaderUserId: string,
    note?: string,
): Promise<void> {
    await expireNeighborhoodOfficerAssignments();
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    const existing = await ScopeAssignment.findOne({
        roleKey: "neighborhood_coleader",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        userId: coleaderUserId,
        unassignedAt: { $exists: false },
    });
    if (existing) return;

    const newColeader = await User.findById(coleaderUserId);
    if (!newColeader) throw new HttpError("Không tìm thấy người dùng", 404);
    if (newColeader.status !== "active") {
        throw new HttpError(
            "Chỉ có thể gán tài khoản đang hoạt động làm tổ phó",
            422,
        );
    }
    if (!newColeader.roles.includes("neighborhood_coleader")) {
        throw new HttpError(
            "Người dùng được chọn phải có vai trò Tổ phó",
            422,
        );
    }

    // 1 nguoi chi duoc la to pho active o DUY NHAT 1 to dan pho cung luc (xem
    // unique index tren ScopeAssignment - {userId,roleKey} khi roleKey=
    // "neighborhood_coleader") - tu choi thay vi tu dong chuyen (khac chinh
    // sach cua to truong), nen kiem tra ro o day de bao loi de hieu thay vi de
    // loi trung khoa tu Mongo.
    const otherActive = await ScopeAssignment.exists({
        roleKey: "neighborhood_coleader",
        scopeType: "NEIGHBORHOOD",
        userId: coleaderUserId,
        scopeId: { $ne: neighborhoodId },
        unassignedAt: { $exists: false },
    });
    if (otherActive) {
        throw new HttpError(
            "Người dùng này đang là tổ phó của một tổ dân phố khác - phải gỡ phân công đó trước",
            409,
        );
    }

    await ScopeAssignment.create({
        roleKey: "neighborhood_coleader",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        userId: coleaderUserId,
        assignedBy: actorId,
        assignedAt: new Date(),
        note,
    });

    await User.findByIdAndUpdate(coleaderUserId, {
        $addToSet: { assignedNeighborhoodIds: neighborhood._id },
    });

    await writeAuditLog({
        actorId,
        action: "neighborhood.coleader_assign",
        targetModel: "Neighborhood",
        targetId: neighborhood._id,
        metadata: { coleaderUserId },
    });
    await NeighborhoodHistory.create({
        neighborhoodId: neighborhood._id,
        actorId,
        action: "COLEADER_ASSIGNED",
        metadata: { coleaderUserId },
    });
}

export async function unassignNeighborhoodColeader(
    actorId: string,
    neighborhoodId: string,
    coleaderUserId: string,
): Promise<void> {
    const now = new Date();
    const result = await ScopeAssignment.updateOne(
        {
            roleKey: "neighborhood_coleader",
            scopeType: "NEIGHBORHOOD",
            scopeId: neighborhoodId,
            userId: coleaderUserId,
            unassignedAt: { $exists: false },
        },
        { unassignedAt: now, unassignedBy: actorId },
    );
    if (result.matchedCount === 0) return;

    await User.findByIdAndUpdate(coleaderUserId, {
        $pull: { assignedNeighborhoodIds: neighborhoodId },
    });

    await writeAuditLog({
        actorId,
        action: "neighborhood.coleader_unassign",
        targetModel: "Neighborhood",
        targetId: neighborhoodId,
        metadata: { coleaderUserId },
    });
    await NeighborhoodHistory.create({
        neighborhoodId,
        actorId,
        action: "COLEADER_UNASSIGNED",
        metadata: { coleaderUserId },
    });
}

export async function getColeaderHistory(neighborhoodId: string) {
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    return ScopeAssignment.find({
        roleKey: "neighborhood_coleader",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
    })
        .sort({ assignedAt: -1 })
        .populate("userId", LEADER_POPULATE)
        .populate("assignedBy", "displayName")
        .populate("unassignedBy", "displayName");
}

export async function listNeighborhoodHistory(neighborhoodId: string) {
    const exists = await Neighborhood.exists({ _id: neighborhoodId });
    if (!exists) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    return NeighborhoodHistory.find({ neighborhoodId })
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("actorId", "displayName");
}

/**
 * Toan bo lich su Cong tac vien cua mot to dan pho (ca da ket thuc), khac
 * listNeighborhoodCollaborators (chi active) - dung cho man xem lich su, hien
 * thi khoang thoi gian dam nhiem (assignedAt -> unassignedAt/endAt).
 */
export async function getCollaboratorHistory(neighborhoodId: string) {
    const exists = await Neighborhood.exists({ _id: neighborhoodId });
    if (!exists) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    return ScopeAssignment.find({
        roleKey: "neighborhood_collaborator",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
    })
        .sort({ assignedAt: -1 })
        .populate("userId", LEADER_POPULATE)
        .populate("subScope.streetId", "name code")
        .populate("subScope.houseIds", "code address")
        .populate("subScope.campaignId", "name status dueAt")
        .populate("assignedBy", "displayName")
        .populate("unassignedBy", "displayName");
}

export async function listNeighborhoodCollaborators(neighborhoodId: string) {
    await expireNeighborhoodOfficerAssignments();
    const exists = await Neighborhood.exists({ _id: neighborhoodId });
    if (!exists) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    return ScopeAssignment.find({
        roleKey: "neighborhood_collaborator",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        unassignedAt: { $exists: false },
    })
        .sort({ assignedAt: -1 })
        .populate("userId", LEADER_POPULATE)
        .populate("subScope.streetId", "name code")
        .populate("subScope.houseIds", "code address")
        .populate("subScope.campaignId", "name status dueAt")
        .populate("assignedBy", "displayName");
}

export async function assignNeighborhoodCollaborator(
    actorId: string,
    neighborhoodId: string,
    input: AssignNeighborhoodCollaboratorInput,
) {
    await expireNeighborhoodOfficerAssignments();
    const [neighborhood, collaborator] = await Promise.all([
        Neighborhood.findById(neighborhoodId),
        User.findById(input.collaboratorUserId),
    ]);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    if (!collaborator || collaborator.status !== "active") {
        throw new HttpError("Cộng tác viên không hợp lệ", 422);
    }
    if (!isCollaboratorOrLegacyCooperator(collaborator.roles)) {
        throw new HttpError("Tài khoản phải có vai trò Cộng tác viên", 422);
    }
    const startAt = input.startAt || new Date();
    if (input.endAt && input.endAt <= startAt) {
        throw new HttpError("Ngày kết thúc phải sau ngày bắt đầu", 422);
    }

    if (input.scopeType === "STREET") {
        const allowed = neighborhood.streetIds.some(id => String(id) === input.streetId);
        if (!allowed) throw new HttpError("Tuyến đường không thuộc Tổ dân phố", 422);
    }
    if (input.scopeType === "HOUSE_GROUP") {
        const count = await HouseRecord.countDocuments({
            _id: { $in: input.houseIds },
            neighborhoodId,
        });
        if (count !== input.houseIds.length) {
            throw new HttpError("Có Nhà số không thuộc Tổ dân phố", 422);
        }
    }
    if (input.scopeType === "CAMPAIGN") {
        const [campaign, target] = await Promise.all([
            InspectionCampaign.findById(input.campaignId),
            InspectionTarget.exists({
                campaignId: input.campaignId,
                neighborhoodId,
            }),
        ]);
        if (!campaign || !target) {
            throw new HttpError("Chiến dịch không giao cho Tổ dân phố này", 422);
        }
    }

    const duplicateFilter: Record<string, unknown> = {
        roleKey: "neighborhood_collaborator",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        userId: input.collaboratorUserId,
        "subScope.kind": input.scopeType,
        unassignedAt: { $exists: false },
    };
    if (input.scopeType === "STREET") duplicateFilter["subScope.streetId"] = input.streetId;
    if (input.scopeType === "CAMPAIGN") duplicateFilter["subScope.campaignId"] = input.campaignId;
    if (await ScopeAssignment.exists(duplicateFilter)) {
        throw new HttpError("Phạm vi công tác này đã được phân công", 409);
    }

    const assignment = await ScopeAssignment.create({
        roleKey: "neighborhood_collaborator",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        userId: input.collaboratorUserId,
        assignedAt: startAt,
        endAt: input.endAt,
        assignedBy: actorId,
        note: input.note,
        subScope: {
            kind: input.scopeType,
            streetId: input.scopeType === "STREET" ? input.streetId : undefined,
            houseIds: input.scopeType === "HOUSE_GROUP" ? input.houseIds : [],
            campaignId: input.scopeType === "CAMPAIGN" ? input.campaignId : undefined,
        },
    });
    await User.updateOne(
        { _id: collaborator._id },
        { $addToSet: { assignedNeighborhoodIds: neighborhood._id } },
    );
    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.collaborator_assign",
            targetModel: "ScopeAssignment",
            targetId: assignment._id,
            metadata: { neighborhoodId, scopeType: input.scopeType },
        }),
        NeighborhoodHistory.create({
            neighborhoodId,
            actorId,
            action: "COLLABORATOR_ASSIGNED",
            metadata: {
                collaboratorUserId: input.collaboratorUserId,
                scopeType: input.scopeType,
            },
        }),
    ]);
    return assignment;
}

export async function unassignNeighborhoodCollaborator(
    actorId: string,
    neighborhoodId: string,
    assignmentId: string,
) {
    const assignment = await ScopeAssignment.findOne({
        _id: assignmentId,
        roleKey: "neighborhood_collaborator",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        unassignedAt: { $exists: false },
    });
    if (!assignment) throw new HttpError("Không tìm thấy phân công", 404);
    assignment.unassignedAt = new Date();
    assignment.unassignedBy = actorId as any;
    await assignment.save();
    const remaining = await ScopeAssignment.exists({
        roleKey: "neighborhood_collaborator",
        scopeType: "NEIGHBORHOOD",
        scopeId: neighborhoodId,
        userId: assignment.userId,
        unassignedAt: { $exists: false },
    });
    if (!remaining) {
        await User.updateOne(
            { _id: assignment.userId },
            { $pull: { assignedNeighborhoodIds: neighborhoodId } },
        );
    }
    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.collaborator_unassign",
            targetModel: "ScopeAssignment",
            targetId: assignment._id,
            metadata: { neighborhoodId },
        }),
        NeighborhoodHistory.create({
            neighborhoodId,
            actorId,
            action: "COLLABORATOR_UNASSIGNED",
            metadata: { collaboratorUserId: assignment.userId },
        }),
    ]);
}

/**
 * Xuat toan bo thanh vien (Tổ trưởng/Tổ phó/Cộng tác viên/vai tro NEIGHBORHOOD
 * khac) cua TAT CA To dan pho ra 1 file Excel - dung cho man
 * NeighborhoodListPage.tsx ("Xuất Excel"), khac han cac ham tren (luon gioi
 * han theo MOT To). scopeId/roleKey la Mixed/string tren ScopeAssignment nen
 * KHONG the .populate() truc tiep - phai batch-resolve rieng ten To/vai tro
 * bang 2 truy van gop (giong ky thuat da dung o
 * userService.getUserManagementScope), tranh N+1 truy van cho tung dong.
 */
export async function exportAllNeighborhoodMembers(): Promise<ExcelJS.Workbook> {
    const assignments = await ScopeAssignment.find({
        scopeType: "NEIGHBORHOOD",
        unassignedAt: { $exists: false },
    })
        .sort({ scopeId: 1, roleKey: 1 })
        .populate("userId", "displayName phone")
        .lean();

    const neighborhoodIds = Array.from(
        new Set(assignments.map(a => String(a.scopeId))),
    );
    const neighborhoods = await Neighborhood.find({
        _id: { $in: neighborhoodIds },
    }).select("name code wardName");
    const neighborhoodById = new Map(
        neighborhoods.map(n => [String(n._id), n]),
    );

    const roleKeys = Array.from(new Set(assignments.map(a => a.roleKey)));
    const roles = await Role.find({ key: { $in: roleKeys } }).select(
        "key name",
    );
    const roleNameByKey = new Map(roles.map(r => [r.key, r.name]));

    const rows = assignments
        .filter(a => a.userId)
        .map(a => {
            const user = a.userId as unknown as {
                displayName: string;
                phone?: string;
            };
            const neighborhood = neighborhoodById.get(String(a.scopeId));
            return {
                displayName: user.displayName,
                phone: user.phone || "",
                roleName: roleNameByKey.get(a.roleKey) || a.roleKey,
                neighborhoodName: neighborhood
                    ? `${neighborhood.code} - ${neighborhood.name}`
                    : String(a.scopeId),
                wardName: neighborhood?.wardName || "",
                assignedAt: a.assignedAt
                    ? new Date(a.assignedAt).toLocaleDateString("vi-VN")
                    : "",
            };
        });

    const workbook = new ExcelJS.Workbook();
    addTableSheet(
        workbook,
        "Thành viên Tổ dân phố",
        [
            { header: "Họ tên", key: "displayName", width: 26 },
            { header: "Số điện thoại", key: "phone", width: 16 },
            { header: "Vai trò", key: "roleName", width: 24 },
            { header: "Tổ dân phố", key: "neighborhoodName", width: 30 },
            { header: "Phường/Xã", key: "wardName", width: 24 },
            { header: "Ngày được gán", key: "assignedAt", width: 18 },
        ],
        rows,
    );
    return workbook;
}
