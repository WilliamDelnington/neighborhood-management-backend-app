import {
    Neighborhood,
    NeighborhoodLeaderAssignment,
    User,
    type INeighborhood,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateNeighborhoodInput,
    UpdateNeighborhoodInput,
} from "@/validators/neighborhood";

const LEADER_POPULATE = "displayName phone status";

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

export async function listNeighborhoods(params: {
    page: number;
    limit: number;
    search?: string;
    active?: boolean;
    leaderUserId?: string;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = {};

    if (params.leaderUserId) {
        // Dung cho man quan ly nguoi dung (admin xem "to dan pho nao user X
        // dang phu trach") - CHI admin duoc dung tham so nay, tranh mot
        // neighborhood_leader tu truy van pham vi cua nguoi dung khac.
        if (!params.actorUser.roles.includes("admin")) {
            throw new HttpError("Ban khong co quyen thuc hien thao tac nay", 403);
        }
        const targetUser = await User.findById(params.leaderUserId).select(
            "neighborhoodId assignedNeighborhoodIds",
        );
        if (!targetUser) throw new HttpError("Khong tim thay nguoi dung", 404);
        const ids = [
            targetUser.neighborhoodId,
            ...(targetUser.assignedNeighborhoodIds || []),
        ].filter(Boolean);
        filter._id = { $in: ids };
    } else if (params.actorUser.roles.includes("neighborhood_leader")) {
        // Chi to truong (neighborhood_leader) bi gioi han ve to dan pho minh
        // phu trach. Cac vai tro khac co quyen neighborhoods.read nhung khong
        // co khai niem "to dan pho cua minh" (vd house_owner chon to dan pho
        // luc tao nha) can thay toan bo danh sach dang active, giong nhu
        // streetService.listStreets khong co scoping nao ca.
        const ids = ownNeighborhoodIds(params.actorUser);
        filter._id = { $in: ids };
    }

    if (params.active !== undefined) filter.active = params.active;
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
            .populate("leaderUserId", LEADER_POPULATE),
        Neighborhood.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

function assertNeighborhoodInScope(user: IUser, neighborhood: INeighborhood): void {
    if (user.roles.includes("admin")) return;
    if (!ownNeighborhoodIds(user).includes(String(neighborhood._id))) {
        throw new HttpError(
            "Ban khong co quyen xem to dan pho nay",
            403,
        );
    }
}

export async function getNeighborhoodById(
    id: string,
    actorUser: IUser,
): Promise<INeighborhood> {
    const neighborhood = await Neighborhood.findById(id).populate(
        "leaderUserId",
        LEADER_POPULATE,
    );
    if (!neighborhood) throw new HttpError("Khong tim thay to dan pho", 404);
    assertNeighborhoodInScope(actorUser, neighborhood);
    return neighborhood;
}

export async function createNeighborhood(
    actorId: string,
    input: CreateNeighborhoodInput,
): Promise<INeighborhood> {
    const existing = await Neighborhood.findOne({
        $or: [{ code: input.code }, { sequence: input.sequence }],
    });
    if (existing) {
        throw new HttpError(
            "Ma hoac so thu tu to dan pho da ton tai",
            409,
        );
    }

    const neighborhood = await Neighborhood.create({
        ...input,
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

    return neighborhood;
}

export async function updateNeighborhood(
    actorId: string,
    id: string,
    patch: UpdateNeighborhoodInput,
): Promise<INeighborhood> {
    const neighborhood = await Neighborhood.findById(id);
    if (!neighborhood) throw new HttpError("Khong tim thay to dan pho", 404);

    const priorState = neighborhood.toObject();
    for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
            (neighborhood as unknown as Record<string, unknown>)[key] = value;
        }
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
    if (!neighborhood) throw new HttpError("Khong tim thay to dan pho", 404);

    const currentLeaderId = neighborhood.leaderUserId
        ? String(neighborhood.leaderUserId)
        : null;

    if (currentLeaderId === leaderUserId) {
        return neighborhood;
    }

    let newLeader: IUser | null = null;
    if (leaderUserId) {
        newLeader = await User.findById(leaderUserId);
        if (!newLeader) throw new HttpError("Khong tim thay nguoi dung", 404);
        if (newLeader.status !== "active") {
            throw new HttpError(
                "Chi co the gan tai khoan dang hoat dong lam to truong",
                422,
            );
        }
        if (!newLeader.roles.includes("neighborhood_leader")) {
            throw new HttpError(
                "Nguoi dung duoc chon phai co vai tro To truong",
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

        return neighborhood;
    }

    await NeighborhoodLeaderAssignment.create({
        neighborhoodId: neighborhood._id,
        leaderUserId,
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

    return await neighborhood.populate("leaderUserId", LEADER_POPULATE);
}

export async function getLeaderHistory(neighborhoodId: string) {
    const neighborhood = await Neighborhood.findById(neighborhoodId);
    if (!neighborhood) throw new HttpError("Khong tim thay to dan pho", 404);

    return NeighborhoodLeaderAssignment.find({ neighborhoodId })
        .sort({ assignedAt: -1 })
        .populate("leaderUserId", LEADER_POPULATE)
        .populate("assignedBy", "displayName")
        .populate("unassignedBy", "displayName");
}
