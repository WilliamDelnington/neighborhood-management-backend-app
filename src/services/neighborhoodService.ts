import {
    HouseRecord,
    Neighborhood,
    NeighborhoodLeaderAssignment,
    NeighborhoodColeaderAssignment,
    NeighborhoodTerm,
    NeighborhoodHistory,
    NeighborhoodCollaboratorAssignment,
    FileAsset,
    InspectionCampaign,
    InspectionTarget,
    User,
    type INeighborhood,
    type INeighborhoodTerm,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateNeighborhoodInput,
    CreateNeighborhoodTermInput,
    AssignNeighborhoodCollaboratorInput,
    UpdateNeighborhoodTermInput,
    UpdateNeighborhoodInput,
} from "@/validators/neighborhood";
import type { NeighborhoodStatus } from "@/models/Neighborhood";
import type { NeighborhoodTermStatus } from "@/models/NeighborhoodTerm";

const LEADER_POPULATE = "displayName phone status";

/**
 * Ket thuc cac phan cong da qua han va dong bo lai scope tren User. Ham duoc
 * goi khi xac thuc tai khoan de ngay ket thuc la rang buoc quyen thuc su,
 * khong chi la thong tin hien thi.
 */
export async function expireNeighborhoodOfficerAssignments(userId?: string) {
    const now = new Date();

    // 1) IN_PROGRESS -> ENDED (dung han) khi da qua endAt.
    const endedOnTime = await NeighborhoodTerm.updateMany(
        { status: "IN_PROGRESS", endAt: { $lt: now } },
        { $set: { status: "ENDED", endedEarly: false } },
    );

    // 2) NOT_STARTED -> IN_PROGRESS khi den/qua startAt - phai xu ly TUNG
    // nhiem ky (khong the gop thanh 1 updateMany nhu buoc 1) vi phai kiem tra
    // rang buoc "toi da 1 IN_PROGRESS/to dan pho" truoc khi chuyen (mot to
    // dan pho co the co nhieu nhiem ky NOT_STARTED "xep hang").
    const dueTerms = await NeighborhoodTerm.find({
        status: "NOT_STARTED",
        startAt: { $lte: now },
    });
    let startedCount = 0;
    for (const term of dueTerms) {
        // eslint-disable-next-line no-await-in-loop
        const alreadyInProgress = await NeighborhoodTerm.exists({
            neighborhoodId: term.neighborhoodId,
            status: "IN_PROGRESS",
        });
        // Da co nhiem ky khac dang IN_PROGRESS o to dan pho nay - bo qua, de
        // nguyen NOT_STARTED cho toi khi admin ket thuc nhiem ky kia hoac huy
        // nhiem ky nay (khong tu dong xu ly xung dot).
        if (alreadyInProgress) continue;
        if (term.endAt < now) {
            // Ca khoang thoi gian da troi qua truoc khi kip bat dau (vd he
            // thong ngung hoat dong mot thoi gian dai) - vao thang ENDED
            // luon, khong dung o IN_PROGRESS mot khoanh khac roi ket thuc ngay.
            term.status = "ENDED";
            term.endedEarly = false;
        } else {
            term.status = "IN_PROGRESS";
        }
        // eslint-disable-next-line no-await-in-loop
        await term.save();
        startedCount += 1;

        if (term.status === "IN_PROGRESS" && (term.leaderUserId || term.coleaderUserId)) {
            try {
                // Nguoi tao nhiem ky (da chi dinh to truong/to pho luc do)
                // dung lam actor cho phan cong tu dong nay - khong co nguoi
                // dang thao tac de gan actor thuc su (day la vong quet ngam).
                // eslint-disable-next-line no-await-in-loop
                await applyDesignatedLeadership(
                    String(term.createdBy),
                    term,
                    true,
                );
            } catch {
                // Loi (vd nguoi duoc chi dinh da mat vai tro/bi khoa tai
                // khoan trong luc cho) KHONG duoc lam hong ca vong quet -
                // nhiem ky van chuyen IN_PROGRESS binh thuong, admin tu gan
                // lai qua the "Tổ trưởng"/"Tổ phó" neu can.
            }
        }
    }

    const expiredTerms = { modifiedCount: endedOnTime.modifiedCount + startedCount };

    const userFilter = userId ? { leaderUserId: userId } : {};
    const expiredLeaders = await NeighborhoodLeaderAssignment.find({
        ...userFilter,
        unassignedAt: { $exists: false },
        endAt: { $lt: now },
    });
    for (const assignment of expiredLeaders) {
        assignment.unassignedAt = assignment.endAt || now;
        await assignment.save();
        await Neighborhood.updateOne(
            {
                _id: assignment.neighborhoodId,
                leaderUserId: assignment.leaderUserId,
            },
            { $unset: { leaderUserId: "" } },
        );
        await User.updateOne(
            { _id: assignment.leaderUserId, neighborhoodId: assignment.neighborhoodId },
            { $unset: { neighborhoodId: "" } },
        );
        await User.updateOne(
            { _id: assignment.leaderUserId },
            { $pull: { assignedNeighborhoodIds: assignment.neighborhoodId } },
        );
    }

    const coleaderFilter = userId ? { coleaderUserId: userId } : {};
    const expiredColeaders = await NeighborhoodColeaderAssignment.find({
        ...coleaderFilter,
        unassignedAt: { $exists: false },
        endAt: { $lt: now },
    });
    for (const assignment of expiredColeaders) {
        assignment.unassignedAt = assignment.endAt || now;
        await assignment.save();
        await User.updateOne(
            { _id: assignment.coleaderUserId },
            { $pull: { assignedNeighborhoodIds: assignment.neighborhoodId } },
        );
    }

    const collaboratorFilter = userId ? { collaboratorUserId: userId } : {};
    const expiredCollaborators = await NeighborhoodCollaboratorAssignment.find({
        ...collaboratorFilter,
        unassignedAt: { $exists: false },
        endAt: { $lt: now },
    });
    for (const assignment of expiredCollaborators) {
        assignment.unassignedAt = assignment.endAt || now;
        await assignment.save();
        const remaining = await NeighborhoodCollaboratorAssignment.exists({
            neighborhoodId: assignment.neighborhoodId,
            collaboratorUserId: assignment.collaboratorUserId,
            unassignedAt: { $exists: false },
        });
        if (!remaining) {
            await User.updateOne(
                { _id: assignment.collaboratorUserId },
                { $pull: { assignedNeighborhoodIds: assignment.neighborhoodId } },
            );
        }
    }

    return (
        expiredTerms.modifiedCount +
        expiredLeaders.length +
        expiredColeaders.length +
        expiredCollaborators.length
    );
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
    const [houseCounts, coleaderAssignments, currentTerms, attachmentCounts] = items.length
        ? await Promise.all([
          HouseRecord.aggregate([
              { $match: { neighborhoodId: { $in: items.map(n => n._id) } } },
              { $group: { _id: "$neighborhoodId", count: { $sum: 1 } } },
          ]),
          NeighborhoodColeaderAssignment.find({
              neighborhoodId: { $in: ids },
              unassignedAt: { $exists: false },
          }).populate("coleaderUserId", LEADER_POPULATE),
          NeighborhoodTerm.find({
              neighborhoodId: { $in: ids },
              status: "IN_PROGRESS",
          }).sort({ startAt: -1 }),
          FileAsset.aggregate([
              { $match: { relatedModel: "Neighborhood", relatedId: { $in: ids } } },
              { $group: { _id: "$relatedId", count: { $sum: 1 } } },
          ]),
        ])
        : [[], [], [], []];
    const houseCountById = new Map<string, number>(
        houseCounts.map(h => [String(h._id), h.count as number]),
    );
    const coleadersById = new Map<string, unknown[]>();
    for (const assignment of coleaderAssignments) {
        const key = String(assignment.neighborhoodId);
        coleadersById.set(key, [
            ...(coleadersById.get(key) || []),
            assignment.coleaderUserId,
        ]);
    }
    const termById = new Map(
        currentTerms.map(term => [String(term.neighborhoodId), term.toObject()]),
    );
    const attachmentCountById = new Map<string, number>(
        attachmentCounts.map(item => [String(item._id), item.count as number]),
    );

    const itemsWithHouseCount = items.map(n => ({
        ...n.toObject(),
        status: n.status || (n.active ? "ACTIVE" : "INACTIVE"),
        houseCount: houseCountById.get(String(n._id)) || 0,
        coleaders: coleadersById.get(String(n._id)) || [],
        currentTerm: termById.get(String(n._id)) || null,
        termRemainingDays: termById.get(String(n._id))
            ? Math.ceil(
                  (new Date((termById.get(String(n._id)) as any).endAt).getTime() -
                      Date.now()) /
                      86_400_000,
              )
            : null,
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
    const [houseCount, coleaders, currentTerm, attachmentCount] = await Promise.all([
        HouseRecord.countDocuments({ neighborhoodId: neighborhood._id }),
        listColeaders(id),
        NeighborhoodTerm.findOne({ neighborhoodId: id, status: "IN_PROGRESS" })
            .sort({ startAt: -1 }),
        FileAsset.countDocuments({ relatedModel: "Neighborhood", relatedId: id }),
    ]);
    return {
        ...neighborhood.toObject(),
        status: neighborhood.status || (neighborhood.active ? "ACTIVE" : "INACTIVE"),
        houseCount,
        coleaders,
        currentTerm,
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
    options?: { termId?: string; endAt?: Date },
    // true = bo qua quet het han o dau ham - CHI dung boi
    // applyDesignatedLeadership khi goi TU BEN TRONG chinh vong quet do (luc
    // mot nhiem ky NOT_STARTED tu dong chuyen sang IN_PROGRESS), tranh de quy
    // goi lai expireNeighborhoodOfficerAssignments() lam lai toan bo vong quet
    // mot lan nua mot cach du thua. Cac noi goi khac (route, applyDesignatedLeadership
    // tu createNeighborhoodTerm/updateNeighborhoodTerm) khong truyen co nay.
    skipExpirySweep = false,
): Promise<INeighborhood> {
    if (!skipExpirySweep) await expireNeighborhoodOfficerAssignments();
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    const currentLeaderId = neighborhood.leaderUserId
        ? String(neighborhood.leaderUserId)
        : null;

    if (currentLeaderId === leaderUserId) {
        return neighborhood;
    }

    let newLeader: IUser | null = null;
    let assignmentEndAt = options?.endAt;
    let termId = options?.termId;
    // Phan cong to truong PHAI gan voi mot nhiem ky dang ACTIVE - to truong
    // khong con la mot "quan he doc lap" voi nhiem ky nua (xem
    // assignLeaderSchema o validator, day la lop chan thu hai o service phong
    // truong hop goi thang service, bo qua validator). Khong ap dung cho
    // nhanh HUY gan (leaderUserId null) - go lien ket khong can chon nhiem ky.
    if (leaderUserId && !termId) {
        throw new HttpError(
            "Vui lòng chọn nhiệm kỳ đang áp dụng trước khi phân công tổ trưởng",
            422,
        );
    }
    if (termId) {
        const term = await NeighborhoodTerm.findOne({
            _id: termId,
            neighborhoodId,
            status: "IN_PROGRESS",
        });
        if (!term) throw new HttpError("Nhiệm kỳ không hợp lệ", 422);
        assignmentEndAt = term.endAt;
    }
    if (assignmentEndAt && assignmentEndAt <= new Date()) {
        throw new HttpError("Ngày kết thúc phân công phải ở tương lai", 422);
    }
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
    if (currentLeaderId) {
        await NeighborhoodLeaderAssignment.updateOne(
            { neighborhoodId: neighborhood._id, unassignedAt: { $exists: false } },
            { unassignedAt: now, unassignedBy: actorId },
        );
        await User.updateOne(
            { _id: currentLeaderId, neighborhoodId: neighborhood._id },
            { $unset: { neighborhoodId: "" } },
        );
        await User.findByIdAndUpdate(currentLeaderId, {
            $pull: { assignedNeighborhoodIds: neighborhood._id },
        });
    }

    // 2) Neu to truong moi dang active o mot to dan pho KHAC, chuyen ho di
    // (dong ban ghi cu, xoa lien ket cu) - giao dien phai xac nhan hanh dong
    // nay voi admin truoc khi goi API, API chi thuc hien.
    if (newLeader) {
        const priorAssignment = await NeighborhoodLeaderAssignment.findOne({
            leaderUserId: newLeader._id,
            neighborhoodId: { $ne: neighborhood._id },
            unassignedAt: { $exists: false },
        });
        if (priorAssignment) {
            await NeighborhoodLeaderAssignment.updateOne(
                { _id: priorAssignment._id },
                { unassignedAt: now, unassignedBy: actorId },
            );
            await Neighborhood.updateOne(
                { _id: priorAssignment.neighborhoodId },
                { $unset: { leaderUserId: "" }, updatedBy: actorId },
            );
            await User.updateOne(
                { _id: newLeader._id, neighborhoodId: priorAssignment.neighborhoodId },
                { $unset: { neighborhoodId: "" } },
            );
            await User.updateOne(
                { _id: newLeader._id },
                { $pull: { assignedNeighborhoodIds: priorAssignment.neighborhoodId } },
            );
        }
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
            metadata: { leaderUserId: currentLeaderId },
        });

        return neighborhood;
    }

    await NeighborhoodLeaderAssignment.create({
        neighborhoodId: neighborhood._id,
        leaderUserId,
        assignedBy: actorId,
        assignedAt: now,
        termId,
        endAt: assignmentEndAt,
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
        metadata: { leaderUserId, termId, endAt: assignmentEndAt },
    });

    return await neighborhood.populate("leaderUserId", LEADER_POPULATE);
}

export async function getLeaderHistory(neighborhoodId: string) {
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    return NeighborhoodLeaderAssignment.find({ neighborhoodId })
        .sort({ assignedAt: -1 })
        .populate("leaderUserId", LEADER_POPULATE)
        .populate("termId", "name startAt endAt status")
        .populate("assignedBy", "displayName")
        .populate("unassignedBy", "displayName");
}

/**
 * Danh sach To pho dang hoat dong cua mot to dan pho. Khac To truong: khong
 * denormalize len Neighborhood - doc truc tiep tu NeighborhoodColeaderAssignment
 * (xem ghi chu trong model ve ly do khong can field rieng).
 */
export async function listColeaders(neighborhoodId: string) {
    await expireNeighborhoodOfficerAssignments();
    return NeighborhoodColeaderAssignment.find({
        neighborhoodId,
        unassignedAt: { $exists: false },
    })
        .sort({ assignedAt: -1 })
        .populate("coleaderUserId", LEADER_POPULATE)
        .populate("termId", "name startAt endAt status")
        .populate("assignedBy", "displayName");
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
    options?: { termId?: string; endAt?: Date },
    // Xem ghi chu tren assignNeighborhoodLeader - cung ly do.
    skipExpirySweep = false,
): Promise<void> {
    if (!skipExpirySweep) await expireNeighborhoodOfficerAssignments();
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);

    let assignmentEndAt = options?.endAt;
    const termId = options?.termId;
    // Phan cong to pho PHAI gan voi mot nhiem ky dang ACTIVE - cung quy tac
    // voi assignNeighborhoodLeader (xem ghi chu tren do), khong co nhanh huy
    // gan rieng trong ham nay (unassignNeighborhoodColeader o duoi khong can
    // nhiem ky).
    if (!termId) {
        throw new HttpError(
            "Vui lòng chọn nhiệm kỳ đang áp dụng trước khi phân công tổ phó",
            422,
        );
    }
    const term = await NeighborhoodTerm.findOne({
        _id: termId,
        neighborhoodId,
        status: "IN_PROGRESS",
    });
    if (!term) throw new HttpError("Nhiệm kỳ không hợp lệ", 422);
    assignmentEndAt = term.endAt;
    if (assignmentEndAt && assignmentEndAt <= new Date()) {
        throw new HttpError("Ngày kết thúc phân công phải ở tương lai", 422);
    }

    const existing = await NeighborhoodColeaderAssignment.findOne({
        neighborhoodId,
        coleaderUserId,
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

    const activeElsewhere = await NeighborhoodColeaderAssignment.findOne({
        coleaderUserId,
        neighborhoodId: { $ne: neighborhoodId },
        unassignedAt: { $exists: false },
    });
    if (activeElsewhere) {
        throw new HttpError(
            "Người dùng này đang là Tổ phó của một tổ dân phố khác",
            422,
        );
    }

    await NeighborhoodColeaderAssignment.create({
        neighborhoodId,
        coleaderUserId,
        assignedBy: actorId,
        assignedAt: new Date(),
        termId,
        endAt: assignmentEndAt,
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
        metadata: { coleaderUserId, termId, endAt: assignmentEndAt },
    });
}

export async function unassignNeighborhoodColeader(
    actorId: string,
    neighborhoodId: string,
    coleaderUserId: string,
): Promise<void> {
    const now = new Date();
    const result = await NeighborhoodColeaderAssignment.updateOne(
        { neighborhoodId, coleaderUserId, unassignedAt: { $exists: false } },
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

    return NeighborhoodColeaderAssignment.find({ neighborhoodId })
        .sort({ assignedAt: -1 })
        .populate("coleaderUserId", LEADER_POPULATE)
        .populate("termId", "name startAt endAt status")
        .populate("assignedBy", "displayName")
        .populate("unassignedBy", "displayName");
}

export async function listNeighborhoodTerms(neighborhoodId: string) {
    const exists = await Neighborhood.exists({ _id: neighborhoodId });
    if (!exists) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    return NeighborhoodTerm.find({ neighborhoodId })
        .sort({ startAt: -1 })
        .populate("createdBy", "displayName")
        .populate("updatedBy", "displayName")
        .populate("leaderUserId", "displayName phone")
        .populate("coleaderUserId", "displayName phone");
}

/**
 * Tra ve trang thai "thuc te" cua mot khoang thoi gian nhiem ky dua vao ngay
 * hien tai - dung khi tao moi (nut "Tạo", khac "Lưu nháp") va khi finalize
 * mot ban nhap (nut "Tạo" luc sua DRAFT). KHONG dung cho DRAFT/CANCELLED (hai
 * trang thai nay khong suy ra tu ngay thang).
 */
function resolveTermStatusByDate(
    startAt: Date,
    endAt: Date,
    now: Date = new Date(),
): "NOT_STARTED" | "IN_PROGRESS" | "ENDED" {
    if (endAt < now) return "ENDED";
    if (startAt <= now) return "IN_PROGRESS";
    return "NOT_STARTED";
}

/**
 * Nem HttpError(409) neu to dan pho da co MOT nhiem ky khac dang IN_PROGRESS -
 * chi goi khi sap chuyen mot nhiem ky sang IN_PROGRESS (tao moi/finalize ban
 * nhap), KHONG can goi cho cac trang thai khac.
 */
async function assertNoOtherInProgressTerm(
    neighborhoodId: string,
    excludeId?: string,
) {
    const existing = await NeighborhoodTerm.exists({
        neighborhoodId,
        status: "IN_PROGRESS",
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (existing) {
        throw new HttpError(
            "Tổ dân phố đã có một nhiệm kỳ đang diễn ra; hãy kết thúc nhiệm kỳ đó trước",
            409,
        );
    }
}

/**
 * Dong ngay cac phan cong to truong/to pho gan voi mot nhiem ky (goi khi
 * nhiem ky ket thuc SOM - ket thuc dung han da tu dong xu ly trong
 * expireNeighborhoodOfficerAssignments vi endAt cua phan cong von da bang
 * endAt cua nhiem ky). Dat endAt = thoi diem ket thuc thuc te (som hon endAt
 * goc), roi quet lai ngay de thuc su thu hoi scope tren User.
 */
async function closeAssignmentsForTerm(termId: unknown, endedAt: Date) {
    await Promise.all([
        NeighborhoodLeaderAssignment.updateMany(
            { termId, unassignedAt: { $exists: false } },
            { $set: { endAt: endedAt } },
        ),
        NeighborhoodColeaderAssignment.updateMany(
            { termId, unassignedAt: { $exists: false } },
            { $set: { endAt: endedAt } },
        ),
    ]);
    await expireNeighborhoodOfficerAssignments();
}

/**
 * Nem HttpError neu leaderUserId/coleaderUserId CHI DINH tren mot nhiem ky
 * (form tao/sua nhiem ky) khong hop le - cung dieu kien voi
 * assignNeighborhoodLeader/assignNeighborhoodColeader (tai khoan dang hoat
 * dong + dung vai tro), kiem tra SOM ngay luc tao/sua nhiem ky de bao loi ro
 * rang thay vi de that bai am tham luc nhiem ky sau nay chuyen sang
 * IN_PROGRESS. Bo qua gia tri rong/null (chua chi dinh).
 */
async function assertLeadershipCandidatesValid(
    leaderUserId?: string | null,
    coleaderUserId?: string | null,
): Promise<void> {
    if (leaderUserId) {
        const leader = await User.findById(leaderUserId);
        if (!leader) throw new HttpError("Không tìm thấy người dùng", 404);
        if (leader.status !== "active") {
            throw new HttpError(
                "Chỉ có thể chỉ định tài khoản đang hoạt động làm tổ trưởng",
                422,
            );
        }
        if (!leader.roles.includes("neighborhood_leader")) {
            throw new HttpError(
                "Người dùng được chọn phải có vai trò Tổ trưởng",
                422,
            );
        }
    }
    if (coleaderUserId) {
        const coleader = await User.findById(coleaderUserId);
        if (!coleader) throw new HttpError("Không tìm thấy người dùng", 404);
        if (coleader.status !== "active") {
            throw new HttpError(
                "Chỉ có thể chỉ định tài khoản đang hoạt động làm tổ phó",
                422,
            );
        }
        if (!coleader.roles.includes("neighborhood_coleader")) {
            throw new HttpError(
                "Người dùng được chọn phải có vai trò Tổ phó",
                422,
            );
        }
    }
}

/**
 * Ap dung to truong/to pho DA CHI DINH tren mot nhiem ky (term.leaderUserId/
 * coleaderUserId) thanh phan cong THUC SU, ngay sau khi nhiem ky do CHUYEN
 * SANG IN_PROGRESS (luc tao, luc finalize ban nhap, hoac tu dong khi den
 * ngay bat dau - xem cac noi goi). skipExpirySweep=true khi goi TU BEN TRONG
 * chinh vong quet expireNeighborhoodOfficerAssignments (tranh de quy quet
 * lai tu dau) - xem ghi chu tren assignNeighborhoodLeader.
 */
async function applyDesignatedLeadership(
    actorId: string,
    term: INeighborhoodTerm,
    skipExpirySweep: boolean,
): Promise<void> {
    if (term.leaderUserId) {
        await assignNeighborhoodLeader(
            actorId,
            String(term.neighborhoodId),
            String(term.leaderUserId),
            undefined,
            { termId: String(term._id) },
            skipExpirySweep,
        );
    }
    if (term.coleaderUserId) {
        await assignNeighborhoodColeader(
            actorId,
            String(term.neighborhoodId),
            String(term.coleaderUserId),
            undefined,
            { termId: String(term._id) },
            skipExpirySweep,
        );
    }
}

/**
 * Tao nhiem ky moi. "saveAsDraft" quyet dinh trang thai ban dau:
 * - true (nut "Lưu nháp"): luon DRAFT, khong can kiem tra gi them.
 * - false (nut "Tạo"): tu tinh NOT_STARTED/IN_PROGRESS (hoac ENDED neu ca
 *   khoang thoi gian da qua) dua theo startAt/endAt - xem resolveTermStatusByDate.
 *   Neu ket qua la IN_PROGRESS, kiem tra khong co nhiem ky IN_PROGRESS nao
 *   khac cua to dan pho nay dang chay.
 * leaderUserId/coleaderUserId (neu co) duoc kiem tra hop le ngay tai day; neu
 * nhiem ky IN_PROGRESS ngay luc tao (startAt <= hom nay), phan cong duoc tao
 * THUC SU luon (xem applyDesignatedLeadership) - neu con NOT_STARTED, chi
 * luu lai "du dinh", se tu dong ap dung khi den ngay bat dau.
 */
export async function createNeighborhoodTerm(
    actorId: string,
    neighborhoodId: string,
    input: CreateNeighborhoodTermInput,
) {
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    await assertLeadershipCandidatesValid(
        input.leaderUserId,
        input.coleaderUserId,
    );

    let status: NeighborhoodTermStatus = "DRAFT";
    if (!input.saveAsDraft) {
        status = resolveTermStatusByDate(input.startAt, input.endAt);
        if (status === "IN_PROGRESS") {
            await assertNoOtherInProgressTerm(neighborhoodId);
        }
    }

    const term = await NeighborhoodTerm.create({
        name: input.name,
        startAt: input.startAt,
        endAt: input.endAt,
        notes: input.notes,
        status,
        endedEarly: status === "ENDED" ? false : undefined,
        leaderUserId: input.leaderUserId || undefined,
        coleaderUserId: input.coleaderUserId || undefined,
        neighborhoodId,
        createdBy: actorId,
        updatedBy: actorId,
    });

    if (status === "IN_PROGRESS") {
        await applyDesignatedLeadership(actorId, term, false);
    }

    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.term_create",
            targetModel: "NeighborhoodTerm",
            targetId: term._id,
            metadata: { neighborhoodId, name: term.name, status },
        }),
        NeighborhoodHistory.create({
            neighborhoodId,
            actorId,
            action: "TERM_CREATED",
            after: term.toObject(),
        }),
    ]);
    return term.populate([
        { path: "leaderUserId", select: "displayName phone" },
        { path: "coleaderUserId", select: "displayName phone" },
    ]);
}

/**
 * Sua thong tin nhiem ky (ten/ngay/ghi chu) - CHI cho phep khi dang DRAFT
 * hoac NOT_STARTED (nhiem ky da IN_PROGRESS/ENDED/CANCELLED la bat bien -
 * khac ban cu, cho PATCH status tuy y khong co state machine). "finalize=true"
 * CHI co tac dung khi dang DRAFT: sau khi luu thong tin, chuyen luon sang
 * NOT_STARTED/IN_PROGRESS theo ngay (nut "Tạo" khi sua mot ban nhap) thay vi
 * giu nguyen DRAFT (nut "Lưu nháp").
 */
export async function updateNeighborhoodTerm(
    actorId: string,
    neighborhoodId: string,
    termId: string,
    patch: UpdateNeighborhoodTermInput,
) {
    const term = await NeighborhoodTerm.findOne({ _id: termId, neighborhoodId });
    if (!term) throw new HttpError("Không tìm thấy nhiệm kỳ", 404);
    if (term.status !== "DRAFT" && term.status !== "NOT_STARTED") {
        throw new HttpError(
            "Chỉ có thể sửa thông tin nhiệm kỳ khi đang ở trạng thái Nháp hoặc Chưa bắt đầu",
            409,
        );
    }

    const { finalize, ...fields } = patch;
    await assertLeadershipCandidatesValid(
        fields.leaderUserId,
        fields.coleaderUserId,
    );

    const before = term.toObject();
    // term.status luc vao ham chi co the la DRAFT hoac NOT_STARTED (guard o
    // tren), nen "vua chuyen sang IN_PROGRESS trong lan goi nay" tuong duong
    // voi "sau khi luu, status la IN_PROGRESS" - chi co the xay ra qua nhanh
    // finalize (DRAFT -> IN_PROGRESS), NOT_STARTED khong the tu chuyen
    // IN_PROGRESS qua ham nay (chi qua vong quet tu dong).
    Object.assign(term, fields, { updatedBy: actorId });
    if (term.endAt < term.startAt) {
        throw new HttpError("Ngày kết thúc nhiệm kỳ phải sau ngày bắt đầu", 422);
    }

    if (finalize && term.status === "DRAFT") {
        const nextStatus = resolveTermStatusByDate(term.startAt, term.endAt);
        if (nextStatus === "IN_PROGRESS") {
            await assertNoOtherInProgressTerm(neighborhoodId, termId);
        }
        term.status = nextStatus;
        if (nextStatus === "ENDED") term.endedEarly = false;
    }

    await term.save();

    if (term.status === "IN_PROGRESS") {
        await applyDesignatedLeadership(actorId, term, false);
    }

    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.term_update",
            targetModel: "NeighborhoodTerm",
            targetId: term._id,
            metadata: {
                neighborhoodId,
                fields: Object.keys(fields),
                finalized: !!finalize,
            },
        }),
        NeighborhoodHistory.create({
            neighborhoodId,
            actorId,
            action: "TERM_UPDATED",
            before,
            after: term.toObject(),
        }),
    ]);
    return term.populate([
        { path: "leaderUserId", select: "displayName phone" },
        { path: "coleaderUserId", select: "displayName phone" },
    ]);
}

/**
 * Huy mot nhiem ky CHUA bat dau (NOT_STARTED -> CANCELLED) - khong can ly do
 * (khac ket thuc som). Khong the huy DRAFT (xoa thay vi huy, xem
 * deleteNeighborhoodTerm) hay nhiem ky da IN_PROGRESS/ENDED/CANCELLED. Khong
 * co phan cong to truong/to pho nao can thu hoi - gan chuc danh luon doi hoi
 * nhiem ky IN_PROGRESS, nen mot nhiem ky NOT_STARTED chua tung co phan cong.
 */
export async function cancelNeighborhoodTerm(
    actorId: string,
    neighborhoodId: string,
    termId: string,
) {
    const term = await NeighborhoodTerm.findOne({ _id: termId, neighborhoodId });
    if (!term) throw new HttpError("Không tìm thấy nhiệm kỳ", 404);
    if (term.status !== "NOT_STARTED") {
        throw new HttpError(
            "Chỉ có thể hủy nhiệm kỳ khi đang ở trạng thái Chưa bắt đầu",
            409,
        );
    }
    const before = term.toObject();
    term.status = "CANCELLED";
    term.updatedBy = actorId as any;
    await term.save();

    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.term_cancel",
            targetModel: "NeighborhoodTerm",
            targetId: term._id,
            metadata: { neighborhoodId },
        }),
        NeighborhoodHistory.create({
            neighborhoodId,
            actorId,
            action: "TERM_CANCELLED",
            before,
            after: term.toObject(),
        }),
    ]);
    return term;
}

/**
 * Ket thuc SOM mot nhiem ky dang dien ra (IN_PROGRESS -> ENDED, endedEarly=
 * true) - BAT BUOC ly do (xem endNeighborhoodTermEarlySchema), va thu hoi
 * ngay cac phan cong to truong/to pho gan voi nhiem ky nay (khac ket thuc
 * dung han, tu dong khong can hanh dong - xem closeAssignmentsForTerm).
 */
export async function endNeighborhoodTermEarly(
    actorId: string,
    neighborhoodId: string,
    termId: string,
    reason: string,
) {
    const term = await NeighborhoodTerm.findOne({ _id: termId, neighborhoodId });
    if (!term) throw new HttpError("Không tìm thấy nhiệm kỳ", 404);
    if (term.status !== "IN_PROGRESS") {
        throw new HttpError("Chỉ có thể kết thúc sớm nhiệm kỳ đang diễn ra", 409);
    }
    const before = term.toObject();
    term.status = "ENDED";
    term.endedEarly = true;
    term.endReason = reason;
    term.updatedBy = actorId as any;
    await term.save();

    await closeAssignmentsForTerm(term._id, new Date());

    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.term_end_early",
            targetModel: "NeighborhoodTerm",
            targetId: term._id,
            metadata: { neighborhoodId, reason },
        }),
        NeighborhoodHistory.create({
            neighborhoodId,
            actorId,
            action: "TERM_ENDED_EARLY",
            before,
            after: term.toObject(),
        }),
    ]);
    return term;
}

/**
 * Xoa han mot nhiem ky - CHI cho phep khi dang DRAFT (chua "cong bo"). Cac
 * trang thai khac chi chuyen tiep (huy/ket thuc), khong bao gio bi xoa de giu
 * lich su.
 */
export async function deleteNeighborhoodTerm(
    actorId: string,
    neighborhoodId: string,
    termId: string,
): Promise<void> {
    const term = await NeighborhoodTerm.findOne({ _id: termId, neighborhoodId });
    if (!term) throw new HttpError("Không tìm thấy nhiệm kỳ", 404);
    if (term.status !== "DRAFT") {
        throw new HttpError("Chỉ có thể xóa nhiệm kỳ đang ở trạng thái Nháp", 409);
    }
    const before = term.toObject();
    await term.deleteOne();

    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.term_delete",
            targetModel: "NeighborhoodTerm",
            targetId: termId,
            metadata: { neighborhoodId, name: before.name },
        }),
        NeighborhoodHistory.create({
            neighborhoodId,
            actorId,
            action: "TERM_DELETED",
            before,
        }),
    ]);
}

export async function listNeighborhoodHistory(neighborhoodId: string) {
    const exists = await Neighborhood.exists({ _id: neighborhoodId });
    if (!exists) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    return NeighborhoodHistory.find({ neighborhoodId })
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("actorId", "displayName");
}

export async function listNeighborhoodCollaborators(neighborhoodId: string) {
    await expireNeighborhoodOfficerAssignments();
    const exists = await Neighborhood.exists({ _id: neighborhoodId });
    if (!exists) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    return NeighborhoodCollaboratorAssignment.find({
        neighborhoodId,
        unassignedAt: { $exists: false },
    })
        .sort({ startAt: -1 })
        .populate("collaboratorUserId", LEADER_POPULATE)
        .populate("streetId", "name code")
        .populate("houseIds", "code address")
        .populate("campaignId", "name status dueAt")
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
    if (
        !collaborator.roles.includes("neighborhood_collaborator") &&
        !collaborator.roles.includes("cooperator")
    ) {
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
        neighborhoodId,
        collaboratorUserId: input.collaboratorUserId,
        scopeType: input.scopeType,
        unassignedAt: { $exists: false },
    };
    if (input.scopeType === "STREET") duplicateFilter.streetId = input.streetId;
    if (input.scopeType === "CAMPAIGN") duplicateFilter.campaignId = input.campaignId;
    if (await NeighborhoodCollaboratorAssignment.exists(duplicateFilter)) {
        throw new HttpError("Phạm vi công tác này đã được phân công", 409);
    }

    const assignment = await NeighborhoodCollaboratorAssignment.create({
        ...input,
        neighborhoodId,
        startAt,
        assignedBy: actorId,
        streetId: input.scopeType === "STREET" ? input.streetId : undefined,
        houseIds: input.scopeType === "HOUSE_GROUP" ? input.houseIds : [],
        campaignId: input.scopeType === "CAMPAIGN" ? input.campaignId : undefined,
    });
    await User.updateOne(
        { _id: collaborator._id },
        { $addToSet: { assignedNeighborhoodIds: neighborhood._id } },
    );
    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.collaborator_assign",
            targetModel: "NeighborhoodCollaboratorAssignment",
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
    const assignment = await NeighborhoodCollaboratorAssignment.findOne({
        _id: assignmentId,
        neighborhoodId,
        unassignedAt: { $exists: false },
    });
    if (!assignment) throw new HttpError("Không tìm thấy phân công", 404);
    assignment.unassignedAt = new Date();
    assignment.unassignedBy = actorId as any;
    await assignment.save();
    const remaining = await NeighborhoodCollaboratorAssignment.exists({
        neighborhoodId,
        collaboratorUserId: assignment.collaboratorUserId,
        unassignedAt: { $exists: false },
    });
    if (!remaining) {
        await User.updateOne(
            { _id: assignment.collaboratorUserId },
            { $pull: { assignedNeighborhoodIds: neighborhoodId } },
        );
    }
    await Promise.all([
        writeAuditLog({
            actorId,
            action: "neighborhood.collaborator_unassign",
            targetModel: "NeighborhoodCollaboratorAssignment",
            targetId: assignment._id,
            metadata: { neighborhoodId },
        }),
        NeighborhoodHistory.create({
            neighborhoodId,
            actorId,
            action: "COLLABORATOR_UNASSIGNED",
            metadata: { collaboratorUserId: assignment.collaboratorUserId },
        }),
    ]);
}
