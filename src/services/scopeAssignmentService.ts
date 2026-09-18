import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { Role, ScopeAssignment, User, Neighborhood } from "@/models";
import type { IScopeAssignment } from "@/models/ScopeAssignment";
import { NEIGHBORHOOD_COLLABORATOR_SCOPES } from "@/models/NeighborhoodCollaboratorAssignment";

// Dich vu gan/huy pham vi "dia ly" (WARD/NEIGHBORHOOD, scopeMechanism=ASSIGNED
// - xem models/Role.ts) cho mot User bang MOT co che chung, doc cau hinh tu
// Role thay vi hardcode theo ten vai tro. Dung boi WardManagementPage.tsx
// (WARD) va NeighborhoodMembersPanel.tsx (NEIGHBORHOOD, CHI cho vai tro KHONG
// phai 1 trong 3 vai tro co san neighborhood_leader/coleader/collaborator -
// 3 vai tro do van di qua assignNeighborhoodLeader/Coleader/Collaborator rieng
// trong neighborhoodService.ts, vi moi ham do co quy tac nghiep vu rieng
// (denormalize Neighborhood.leaderUserId, gioi han 1 to/nguoi...) ma ham
// chung nay KHONG co.
//
// KHONG dung Mongo transaction (dong bo voi phan con lai cua codebase, vd
// assignNeighborhoodLeader/assignNeighborhoodColeader cung khong dung) - kiem
// tra dieu kien TRUOC khi mutate bat cu gi, giam thieu (khong loai bo hoan
// toan) rui ro race condition, giong quy uoc hien co.

export type AssignScopeInput = {
    userId: string;
    roleKey: string;
    scopeType: "WARD" | "NEIGHBORHOOD";
    scopeId: string | number;
    // string thay vi ObjectId - day la du lieu tho tu validator (Zod chi
    // kiem hinh dang string), Mongoose tu ep kieu sang ObjectId luc luu (cung
    // quy uoc voi assignNeighborhoodCollaborator o neighborhoodService.ts).
    subScope?: {
        kind: (typeof NEIGHBORHOOD_COLLABORATOR_SCOPES)[number];
        streetId?: string;
        houseIds?: string[];
        campaignId?: string;
    };
    note?: string;
};

async function loadAssignableRole(roleKey: string) {
    const role = await Role.findOne({ key: roleKey, active: true });
    if (!role) throw new HttpError("Vai trò không hợp lệ hoặc đã bị vô hiệu hóa", 422);
    if (role.scopeMechanism !== "ASSIGNED") {
        throw new HttpError(
            "Vai trò này không quản lý dữ liệu theo hình thức được gán (ASSIGNED)",
            422,
        );
    }
    return role;
}

/**
 * Tinh lai truong cache tren User (neighborhoodId/assignedNeighborhoodIds,
 * wardCode/wardName) tu cac ScopeAssignment dang active - de rbac.ts va cac
 * noi khac tiep tuc doc duoc pham vi qua truong tren User (nhanh, dong bo)
 * thay vi phai truy van ScopeAssignment moi lan. Goi lai sau MOI thay doi
 * (assign/unassign) de cache khong bi lech du lieu goc.
 */
async function rebuildUserScopeCache(userId: string): Promise<void> {
    const active = await ScopeAssignment.find({
        userId,
        unassignedAt: { $exists: false },
    }).lean();

    const neighborhoodAssignments = active.filter(a => a.scopeType === "NEIGHBORHOOD");
    const wardAssignments = active.filter(a => a.scopeType === "WARD");

    const assignedNeighborhoodIds = neighborhoodAssignments.map(a => a.scopeId);
    // Chi neighborhood_leader duoc gan neighborhoodId (truong "chinh", singular)
    // - giong quy uoc cu trong assignNeighborhoodLeader; coleader/collaborator
    // chi nam trong assignedNeighborhoodIds (mang phu).
    const leaderAssignment = neighborhoodAssignments.find(
        a => a.roleKey === "neighborhood_leader",
    );

    // QUAN TRONG: gan truong = undefined trong update object KHONG xoa duoc
    // field tren Mongo (Mongoose bo qua key co gia tri undefined khi dung
    // $set) - phai dung $unset rieng, giong quy uoc da dung o
    // neighborhoodService.ts (unassignNeighborhoodLeader) va
    // appointmentServiceService.ts. Thieu buoc nay khien wardCode/neighborhoodId
    // "dinh" lai tren User sau khi unassign, lam UI (vd WardManagementPage)
    // van hien thi nguoi dung nhu dang con duoc gan.
    const setFields: Record<string, unknown> = { assignedNeighborhoodIds };
    const unsetFields: Record<string, unknown> = {};

    if (leaderAssignment) {
        setFields.neighborhoodId = leaderAssignment.scopeId;
    } else {
        unsetFields.neighborhoodId = "";
    }

    if (wardAssignments.length > 0) {
        // wardCode la du lieu tu API hanh chinh ngoai (khong co model Ward
        // rieng) - lay tu ban ghi ScopeAssignment gan nhat con active.
        const latest = wardAssignments[wardAssignments.length - 1];
        setFields.wardCode = latest.scopeId;
    } else {
        unsetFields.wardCode = "";
        unsetFields.wardName = "";
    }

    const update: Record<string, unknown> = { $set: setFields };
    if (Object.keys(unsetFields).length > 0) update.$unset = unsetFields;

    await User.findByIdAndUpdate(userId, update);
}

export async function assignScope(
    actorId: string,
    input: AssignScopeInput,
): Promise<IScopeAssignment> {
    const role = await loadAssignableRole(input.roleKey);
    if (role.scopeType !== input.scopeType) {
        throw new HttpError(
            `Vai trò "${role.name}" không quản lý dữ liệu theo phạm vi ${input.scopeType}`,
            422,
        );
    }

    const targetUser = await User.findById(input.userId);
    if (!targetUser) throw new HttpError("Không tìm thấy người dùng", 404);
    if (targetUser.status !== "active") {
        throw new HttpError("Chỉ có thể gán phạm vi cho tài khoản đang hoạt động", 422);
    }
    if (!targetUser.roles.includes(input.roleKey)) {
        throw new HttpError(
            `Tài khoản được chọn phải có vai trò "${role.name}"`,
            422,
        );
    }
    if (input.scopeType === "NEIGHBORHOOD") {
        const neighborhoodExists = await Neighborhood.exists({ _id: input.scopeId });
        if (!neighborhoodExists) throw new HttpError("Không tìm thấy tổ dân phố", 404);
    }

    // Idempotent: da active dung nhu the nay roi thi khong lam gi them (giong
    // early-return cua assignNeighborhoodLeader/assignNeighborhoodCollaborator).
    const existingSame = await ScopeAssignment.findOne({
        userId: input.userId,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        unassignedAt: { $exists: false },
    });
    if (existingSame) return existingSame;

    const now = new Date();

    const created = await ScopeAssignment.create({
        userId: input.userId,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        subScope: input.subScope,
        assignedAt: now,
        assignedBy: actorId,
        note: input.note,
    });

    await rebuildUserScopeCache(input.userId);

    await writeAuditLog({
        actorId,
        action: "scope_assignment.assign",
        targetModel: "ScopeAssignment",
        targetId: created._id,
        metadata: {
            userId: input.userId,
            roleKey: input.roleKey,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
        },
    });

    return created;
}

export async function unassignScope(
    actorId: string,
    scopeAssignmentId: string,
    note?: string,
): Promise<void> {
    const assignment = await ScopeAssignment.findOne({
        _id: scopeAssignmentId,
        unassignedAt: { $exists: false },
    });
    if (!assignment) throw new HttpError("Không tìm thấy phân công đang hoạt động", 404);

    assignment.unassignedAt = new Date();
    assignment.unassignedBy = actorId as any;
    if (note) assignment.note = note;
    await assignment.save();

    await rebuildUserScopeCache(String(assignment.userId));

    await writeAuditLog({
        actorId,
        action: "scope_assignment.unassign",
        targetModel: "ScopeAssignment",
        targetId: assignment._id,
        metadata: {
            userId: String(assignment.userId),
            roleKey: assignment.roleKey,
            scopeType: assignment.scopeType,
            scopeId: assignment.scopeId,
        },
    });
}

/**
 * Tien ich huy gan theo "muc tieu" (userId+roleKey+scopeType+scopeId) thay vi
 * theo _id cua ScopeAssignment - tien cho UI khong can luu/truyen _id (vd
 * WardManagementPage.tsx chi co san User voi wardCode, khong luu rieng
 * scopeAssignmentId). Khong lam gi (khong throw) neu khong tim thay ban ghi
 * dang active khop - idempotent, giong quy uoc cua cac ham unassign cu.
 */
export async function unassignScopeByTarget(
    actorId: string,
    target: {
        userId: string;
        roleKey: string;
        scopeType: "WARD" | "NEIGHBORHOOD";
        scopeId: string | number;
    },
    note?: string,
): Promise<void> {
    const assignment = await ScopeAssignment.findOne({
        ...target,
        unassignedAt: { $exists: false },
    });
    if (!assignment) return;
    await unassignScope(actorId, String(assignment._id), note);
}

export async function listActiveScopeHolders(params: {
    roleKey?: string;
    scopeType?: "WARD" | "NEIGHBORHOOD";
    scopeId?: string | number;
}) {
    // KHONG spread thang `params` vao query - mot key voi gia tri `undefined`
    // (vd roleKey khong duoc truyen) van la mot key ton tai sau spread, va
    // driver Mongo/Mongoose serialize no thanh dieu kien "bang null" thay vi
    // "khong loc theo truong nay", khien query khong khop ban ghi nao ca du du
    // lieu ton tai (loi da gap thuc te khi test).
    const query: Record<string, unknown> = { unassignedAt: { $exists: false } };
    if (params.roleKey !== undefined) query.roleKey = params.roleKey;
    if (params.scopeType !== undefined) query.scopeType = params.scopeType;
    if (params.scopeId !== undefined) query.scopeId = params.scopeId;
    return ScopeAssignment.find(query)
        .sort({ assignedAt: -1 })
        .populate("userId", "displayName phone");
}

export async function listScopeHistory(params: {
    scopeType: "WARD" | "NEIGHBORHOOD";
    scopeId: string | number;
    roleKey?: string;
}) {
    const query: Record<string, unknown> = {
        scopeType: params.scopeType,
        scopeId: params.scopeId,
    };
    if (params.roleKey !== undefined) query.roleKey = params.roleKey;
    return ScopeAssignment.find(query)
        .sort({ assignedAt: -1 })
        .populate("userId", "displayName phone")
        .populate("assignedBy", "displayName phone")
        .populate("unassignedBy", "displayName phone");
}
