import {
    ChangeRequest,
    HouseOwnership,
    HouseRecord,
    Neighborhood,
    User,
    type ChangeRequestTargetModel,
    type IChangeRequest,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import {
    assertHouseRecordInScope,
    updateHouseRecord,
    HOUSE_RECORD_PROTECTED_FIELDS,
} from "@/services/houseRecordService";
import {
    endHouseOwnership,
    resolveActingUserId,
} from "@/services/houseOwnershipService";
import type { CreateChangeRequestInput } from "@/validators/changeRequest";

const CHANGE_REQUEST_EDITABLE_FIELDS: Record<ChangeRequestTargetModel, string[]> = {
    HouseRecord: HOUSE_RECORD_PROTECTED_FIELDS,
    HouseOwnership: [],
    User: ["displayName"],
};

async function assertCanRequestChange(
    actorUser: IUser,
    targetModel: ChangeRequestTargetModel,
    targetId: string,
): Promise<void> {
    if (targetModel === "User") {
        if (targetId !== String(actorUser._id)) {
            throw new HttpError(
                "Ban chi co the de nghi thay doi thong tin cua chinh minh",
                403,
            );
        }
        return;
    }
    if (targetModel === "HouseRecord") {
        const houseRecord = await HouseRecord.findById(targetId).select(
            "_id neighborhoodId",
        );
        if (!houseRecord) throw new HttpError("Khong tim thay nha so", 404);
        await assertHouseRecordInScope(actorUser, houseRecord);
        return;
    }
    // HouseOwnership: chi chinh nguoi dung sau quan he so huu do moi duoc de
    // nghi ket thuc no (khong phai bat ky chu so huu nao khac cua cung nha).
    const ownership = await HouseOwnership.findById(targetId);
    if (!ownership) throw new HttpError("Khong tim thay quan he so huu", 404);
    const actingUserId = await resolveActingUserId(
        ownership.ownerType,
        ownership.ownerId,
    );
    if (!actingUserId || String(actingUserId) !== String(actorUser._id)) {
        throw new HttpError(
            "Ban khong co quyen de nghi doi voi quan he so huu nay",
            403,
        );
    }
}

async function getSnapshot(
    targetModel: ChangeRequestTargetModel,
    targetId: string,
    fields: string[],
): Promise<Record<string, unknown>> {
    const doc =
        targetModel === "User"
            ? await User.findById(targetId).select(fields.join(" "))
            : await HouseRecord.findById(targetId).select(fields.join(" "));
    if (!doc) return {};
    const snapshot: Record<string, unknown> = {};
    for (const field of fields) {
        snapshot[field] = (doc as unknown as Record<string, unknown>)[field];
    }
    return snapshot;
}

export async function createChangeRequest(
    actorUser: IUser,
    input: CreateChangeRequestInput,
) {
    await assertCanRequestChange(actorUser, input.targetModel, input.targetId);

    let previousSnapshot: Record<string, unknown> | undefined;
    let patch: Record<string, unknown> | undefined;
    if (input.changeType === "update") {
        const allowedFields = CHANGE_REQUEST_EDITABLE_FIELDS[input.targetModel];
        const invalidKeys = Object.keys(input.patch || {}).filter(
            key => !allowedFields.includes(key),
        );
        if (invalidKeys.length > 0) {
            throw new HttpError(
                `Khong the de nghi thay doi truong: ${invalidKeys.join(", ")}`,
                400,
            );
        }
        previousSnapshot = await getSnapshot(
            input.targetModel,
            input.targetId,
            Object.keys(input.patch || {}),
        );
        patch = input.patch;
    } else if (input.changeType === "transfer_neighborhood") {
        const newNeighborhoodId = String(input.patch?.neighborhoodId);
        const newNeighborhood = await Neighborhood.findById(newNeighborhoodId);
        if (!newNeighborhood) {
            throw new HttpError("Khong tim thay to dan pho muon chuyen den", 404);
        }
        const houseRecord = await HouseRecord.findById(input.targetId).select(
            "neighborhoodId",
        );
        if (
            houseRecord?.neighborhoodId &&
            String(houseRecord.neighborhoodId) === newNeighborhoodId
        ) {
            throw new HttpError(
                "Nha so nay da thuoc to dan pho duoc chon",
                400,
            );
        }
        previousSnapshot = { neighborhoodId: houseRecord?.neighborhoodId };
        patch = { neighborhoodId: newNeighborhoodId };
    } else if (input.changeType === "data_discrepancy") {
        // Cung dieu kien truong duoc phep nhu "update" - chi khac o cho can
        // hai vong duyet (xem reviewStage ben duoi va decideChangeRequest).
        const allowedFields = CHANGE_REQUEST_EDITABLE_FIELDS[input.targetModel];
        const invalidKeys = Object.keys(input.patch || {}).filter(
            key => !allowedFields.includes(key),
        );
        if (invalidKeys.length > 0) {
            throw new HttpError(
                `Khong the de nghi thay doi truong: ${invalidKeys.join(", ")}`,
                400,
            );
        }
        previousSnapshot = await getSnapshot(
            input.targetModel,
            input.targetId,
            Object.keys(input.patch || {}),
        );
        patch = input.patch;
    }

    const changeRequest = await ChangeRequest.create({
        targetModel: input.targetModel,
        targetId: input.targetId,
        requestedBy: actorUser._id,
        changeType: input.changeType,
        patch,
        previousSnapshot,
        reason: input.reason,
        status: "pending",
        reviewStage:
            input.changeType === "data_discrepancy"
                ? "neighborhood_review"
                : undefined,
    });

    await createNotification({
        title: "Có yêu cầu thay đổi mới",
        body: `${actorUser.displayName} gửi yêu cầu ${
            input.changeType === "unlink"
                ? "hủy liên kết"
                : input.changeType === "transfer_neighborhood"
                    ? "chuyển tổ dân phố"
                    : "thay đổi thông tin"
        }`,
        type: "change_request.created",
        targetRoles: ["admin", "secretary", "neighborhood_leader"],
        relatedModel: "ChangeRequest",
        relatedId: changeRequest._id,
        createdBy: actorUser._id,
    });

    return changeRequest;
}

export async function listChangeRequests(params: {
    page: number;
    limit: number;
    // "mine": chi thay yeu cau cua chinh minh (nguoi khong co
    // change_requests.read - vd house_owner - luon bi ep ve che do nay o tang
    // route, xem app/api/change-requests/route.ts). "staff": nhan vien
    // (change_requests.read) xem toan bo, tru phi ho chu dong loc "mine".
    view: "mine" | "staff";
    status?: string;
    actorUser: IUser;
}) {
    const filter: Record<string, unknown> = {};
    if (params.view === "mine") {
        filter.requestedBy = params.actorUser._id;
    }
    if (params.status) filter.status = params.status;

    const [items, total] = await Promise.all([
        ChangeRequest.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("requestedBy", "displayName phone")
            .populate("decidedBy", "displayName"),
        ChangeRequest.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getChangeRequestById(id: string) {
    const changeRequest = await ChangeRequest.findById(id)
        .populate("requestedBy", "displayName phone")
        .populate("decidedBy", "displayName");
    if (!changeRequest) throw new HttpError("Khong tim thay yeu cau", 404);
    return changeRequest;
}

function assertPending(changeRequest: IChangeRequest): void {
    if (changeRequest.status !== "pending") {
        throw new HttpError("Yeu cau nay da duoc xu ly truoc do", 400);
    }
}

export async function cancelChangeRequest(actorUser: IUser, id: string) {
    const changeRequest = await ChangeRequest.findById(id);
    if (!changeRequest) throw new HttpError("Khong tim thay yeu cau", 404);
    if (String(changeRequest.requestedBy) !== String(actorUser._id)) {
        throw new HttpError("Ban khong co quyen huy yeu cau nay", 403);
    }
    assertPending(changeRequest);
    changeRequest.status = "cancelled";
    await changeRequest.save();
    return changeRequest;
}

async function applyApprovedChange(
    actorUser: IUser,
    changeRequest: IChangeRequest,
): Promise<void> {
    if (changeRequest.changeType === "unlink") {
        // targetId cua changeType="unlink" la HouseOwnership._id; houseId can
        // truyen them cho endHouseOwnership (xem chu ky ham) - lay tu chinh
        // ban ghi HouseOwnership.
        const ownership = await HouseOwnership.findById(changeRequest.targetId);
        if (!ownership) throw new HttpError("Khong tim thay quan he so huu", 404);
        await endHouseOwnership(
            actorUser,
            String(ownership.houseId),
            String(ownership._id),
            changeRequest.decisionNote,
        );
        return;
    }

    if (changeRequest.targetModel === "User") {
        await User.findByIdAndUpdate(changeRequest.targetId, changeRequest.patch);
    } else {
        // Di qua updateHouseRecord (khong update tho) de chay lai logic resolve
        // cluster/streetId/neighborhoodId->province/ward - xem ghi chu tren
        // opts.bypassVerifiedGate trong houseRecordService.ts.
        await updateHouseRecord(
            actorUser,
            String(changeRequest.targetId),
            changeRequest.patch || {},
            { bypassVerifiedGate: true },
        );
    }
}

/**
 * Chuyen doi rieng cho changeType="transfer_neighborhood": khac quyet dinh
 * thong thuong (chi can change_requests.decide), chuyen to CHI duoc quyet
 * dinh boi can bo UBND (PCO) hoac To truong/To pho cua to dan pho SE NHAN
 * (khong phai to dan pho hien tai, va khong phai bat ky ai co
 * change_requests.decide) - tranh mot To truong tu duyet chuyen nha vao to
 * cua chinh minh ma To do khong biet/dong y.
 */
async function assertCanDecideTransfer(
    actorUser: IUser,
    changeRequest: IChangeRequest,
): Promise<void> {
    if (actorUser.roles.includes("admin")) return;
    if (actorUser.roles.includes("people_committee_official")) return;

    const receivingNeighborhoodId = String(changeRequest.patch?.neighborhoodId);
    if (
        actorUser.roles.includes("neighborhood_leader") ||
        actorUser.roles.includes("neighborhood_coleader")
    ) {
        const ownIds = [
            actorUser.neighborhoodId,
            ...(actorUser.assignedNeighborhoodIds || []),
        ]
            .filter(Boolean)
            .map(String);
        if (ownIds.includes(receivingNeighborhoodId)) return;
    }

    throw new HttpError(
        "Chi can bo UBND hoac To truong/To pho cua to dan pho se nhan moi duoc quyet dinh yeu cau chuyen to",
        403,
    );
}

/**
 * Chi ap dung cho changeType="data_discrepancy": vong "neighborhood_review"
 * chi To truong/To pho cua To dan pho dang quan ly Nha so nay (hoac admin/PCO)
 * moi duoc xac nhan; vong "ward_review" (buoc cuoi, quyet dinh co ap dung
 * patch hay khong) chi admin/PCO moi duoc quyet dinh.
 */
async function assertCanDecideDiscrepancyStage(
    actorUser: IUser,
    changeRequest: IChangeRequest,
): Promise<void> {
    if (actorUser.roles.includes("admin")) return;
    if (actorUser.roles.includes("people_committee_official")) return;

    if (changeRequest.reviewStage === "ward_review") {
        throw new HttpError(
            "Chi can bo UBND moi duoc xac nhan buoc cuoi cua yeu cau doi soat du lieu",
            403,
        );
    }

    if (
        actorUser.roles.includes("neighborhood_leader") ||
        actorUser.roles.includes("neighborhood_coleader")
    ) {
        const houseRecord = await HouseRecord.findById(
            changeRequest.targetId,
        ).select("neighborhoodId");
        const ownIds = [
            actorUser.neighborhoodId,
            ...(actorUser.assignedNeighborhoodIds || []),
        ]
            .filter(Boolean)
            .map(String);
        if (
            houseRecord?.neighborhoodId &&
            ownIds.includes(String(houseRecord.neighborhoodId))
        )
            return;
    }

    throw new HttpError(
        "Chi can bo UBND hoac To truong/To pho cua to dan pho phu trach nha so nay moi duoc xac nhan",
        403,
    );
}

export async function decideChangeRequest(
    actorUser: IUser,
    id: string,
    input: { approve: boolean; decisionNote?: string },
) {
    const changeRequest = await ChangeRequest.findById(id);
    if (!changeRequest) throw new HttpError("Khong tim thay yeu cau", 404);
    assertPending(changeRequest);
    if (changeRequest.changeType === "transfer_neighborhood") {
        await assertCanDecideTransfer(actorUser, changeRequest);
    }
    if (changeRequest.changeType === "data_discrepancy") {
        await assertCanDecideDiscrepancyStage(actorUser, changeRequest);
    }

    // Vong dau ("neighborhood_review") cua data_discrepancy chi ghi nhan xac
    // nhan cua To dan pho va chuyen sang vong Phuong ("ward_review") - KHONG
    // chot status/ap dung patch. 3 loai con lai khong bao gio dat reviewStage
    // nen luon roi thang xuong nhanh chot ben duoi, dung y het truoc day.
    if (
        changeRequest.changeType === "data_discrepancy" &&
        changeRequest.reviewStage === "neighborhood_review"
    ) {
        changeRequest.stageDecisions = [
            ...(changeRequest.stageDecisions || []),
            {
                stage: "neighborhood_review",
                decidedBy: actorUser._id as any,
                decidedAt: new Date(),
                outcome: input.approve ? "verified" : "need_update",
                note: input.decisionNote,
            },
        ];
        changeRequest.reviewStage = "ward_review";
        await changeRequest.save();

        await writeAuditLog({
            actorId: String(actorUser._id),
            action: "change_request.neighborhood_review",
            targetModel: "ChangeRequest",
            targetId: changeRequest._id,
            metadata: { decisionNote: input.decisionNote, outcome: input.approve ? "verified" : "need_update" },
        });

        return changeRequest;
    }

    changeRequest.status = input.approve ? "approved" : "rejected";
    changeRequest.decidedBy = actorUser._id as any;
    changeRequest.decidedAt = new Date();
    changeRequest.decisionNote = input.decisionNote;
    if (changeRequest.changeType === "data_discrepancy") {
        changeRequest.stageDecisions = [
            ...(changeRequest.stageDecisions || []),
            {
                stage: "ward_review",
                decidedBy: actorUser._id as any,
                decidedAt: new Date(),
                outcome: input.approve ? "confirmed" : "need_recheck",
                note: input.decisionNote,
            },
        ];
    }
    await changeRequest.save();

    if (input.approve) {
        await applyApprovedChange(actorUser, changeRequest);
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: input.approve ? "change_request.approve" : "change_request.reject",
        targetModel: "ChangeRequest",
        targetId: changeRequest._id,
        metadata: { decisionNote: input.decisionNote },
    });

    await createNotification({
        title: input.approve ? "Yêu cầu đã được duyệt" : "Yêu cầu bị từ chối",
        body:
            changeRequest.decisionNote ||
            (input.approve
                ? "Yêu cầu thay đổi của bạn đã được duyệt."
                : "Yêu cầu thay đổi của bạn đã bị từ chối."),
        type: input.approve ? "change_request.approved" : "change_request.rejected",
        targetUserIds: [changeRequest.requestedBy],
        relatedModel: "ChangeRequest",
        relatedId: changeRequest._id,
        createdBy: actorUser._id,
    });

    return changeRequest;
}
