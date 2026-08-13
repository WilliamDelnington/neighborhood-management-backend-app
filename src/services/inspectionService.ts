import { Types, type FilterQuery } from "mongoose";
import {
    FileAsset,
    HouseRecord,
    InspectionAnswer,
    InspectionCampaign,
    InspectionResult,
    InspectionTarget,
    Neighborhood,
    User,
    type IInspectionCampaign,
    type IInspectionResult,
    type IInspectionTarget,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { requirePermission, userHasPermission } from "@/lib/rbac";
import { saveUploadedFile } from "@/lib/localUpload";
import { writeAuditLog } from "@/services/auditService";
import { createNotification } from "@/services/notificationService";
import {
    getActingOwnerUserIdsForHouses,
    getHouseIdsForActingOwner,
    isHouseOwnerActor,
} from "@/services/houseOwnershipService";
import type {
    InspectionOutcome,
    InspectionResultStatus,
} from "@/types";
import type {
    AssignInspectionTargetsInput,
    CreateInspectionCampaignInput,
    HouseInspectionSelfDeclarationInput,
    InspectionReviewInput,
    RemindInspectionInput,
    SaveInspectionResultInput,
    SubmitInspectionToWardInput,
    UpdateInspectionCampaignChecklistInput,
    UpdateInspectionResultInput,
} from "@/validators/inspection";

const COLLABORATOR_ROLES = ["neighborhood_collaborator", "cooperator"];
const MUTABLE_RESULT_STATUSES: InspectionResultStatus[] = [
    "DRAFT",
    "FIELD_CHECK_REQUIRED",
];
const HOUSE_MUTABLE_RESULT_STATUSES: InspectionResultStatus[] = [
    "DRAFT",
    "REQUEST_REVISION",
];

function idStrings(values: unknown[]): string[] {
    return values.filter(Boolean).map(String);
}

function referenceId(value: unknown): string {
    if (value && typeof value === "object" && "_id" in value) {
        return String((value as { _id: unknown })._id);
    }
    return value ? String(value) : "";
}

function actorNeighborhoodIds(user: IUser): string[] {
    return [...new Set(idStrings([user.neighborhoodId, ...(user.assignedNeighborhoodIds || [])]))];
}

function isCollaborator(user: IUser): boolean {
    return user.roles.some(role => COLLABORATOR_ROLES.includes(role));
}

function scopedTargetFilter(
    actorUser: IUser,
    filter: FilterQuery<IInspectionTarget> = {},
): FilterQuery<IInspectionTarget> {
    if (actorUser.roles.includes("admin")) return filter;
    if (isCollaborator(actorUser)) {
        return {
            ...filter,
            assignedCollaboratorUserId: actorUser._id,
        };
    }
    return {
        ...filter,
        neighborhoodId: { $in: actorNeighborhoodIds(actorUser) },
    };
}

function isCampaignCreator(actorUser: IUser, campaign: IInspectionCampaign): boolean {
    return referenceId(campaign.createdByWardUserId) === String(actorUser._id);
}

function scopedCampaignTargetFilter(
    actorUser: IUser,
    campaign: IInspectionCampaign,
    filter: FilterQuery<IInspectionTarget> = {},
): FilterQuery<IInspectionTarget> {
    if (isCampaignCreator(actorUser, campaign)) return filter;
    return scopedTargetFilter(actorUser, filter);
}

async function assertTargetInScope(
    actorUser: IUser,
    target: IInspectionTarget,
): Promise<void> {
    if (actorUser.roles.includes("admin")) return;
    const campaign = await InspectionCampaign.findById(target.campaignId).select(
        "createdByWardUserId",
    );
    if (campaign && isCampaignCreator(actorUser, campaign)) return;
    if (isCollaborator(actorUser)) {
        if (referenceId(target.assignedCollaboratorUserId) !== String(actorUser._id)) {
            throw new HttpError("Bạn không được phân công rà soát Nhà số này", 403);
        }
        return;
    }
    if (!actorNeighborhoodIds(actorUser).includes(String(target.neighborhoodId))) {
        throw new HttpError("Nhà số nằm ngoài Tổ dân phố được phân công", 403);
    }
}

function assertCampaignExecutable(campaign: IInspectionCampaign): void {
    if (campaign.status === "LOCKED" || campaign.status === "CLOSED") {
        throw new HttpError("Chiến dịch đã khóa, không thể thay đổi kết quả", 409);
    }
    if (campaign.status !== "ACTIVE") {
        throw new HttpError("Chiến dịch chưa ở trạng thái đang thực hiện", 409);
    }
}

async function campaignForTarget(target: IInspectionTarget) {
    const campaign = await InspectionCampaign.findById(target.campaignId);
    if (!campaign) throw new HttpError("Không tìm thấy chiến dịch", 404);
    return campaign;
}

async function scopedTarget(actorUser: IUser, targetId: string) {
    const target = await InspectionTarget.findById(targetId);
    if (!target) throw new HttpError("Không tìm thấy Nhà số cần rà soát", 404);
    await assertTargetInScope(actorUser, target);
    return target;
}

async function assertCampaignVisible(actorUser: IUser, campaignId: string) {
    const campaign = await InspectionCampaign.findById(campaignId);
    if (!campaign) throw new HttpError("Không tìm thấy chiến dịch", 404);
    if (actorUser.roles.includes("admin") || isCampaignCreator(actorUser, campaign)) {
        return campaign;
    }
    const visible = await InspectionTarget.exists(
        scopedTargetFilter(actorUser, { campaignId: campaign._id }),
    );
    if (!visible) throw new HttpError("Chiến dịch nằm ngoài phạm vi được phân công", 403);
    return campaign;
}

function creationNeighborhoodFilter(actorUser: IUser): Record<string, unknown> {
    const filter: Record<string, unknown> = { active: true };
    if (actorUser.roles.includes("admin")) return filter;
    if (!actorUser.wardCode) {
        throw new HttpError(
            "Tài khoản chưa được gán Phường/xã nên chưa thể tạo chiến dịch",
            422,
        );
    }
    filter.wardCode = actorUser.wardCode;
    return filter;
}

export async function getInspectionCreationOptions(
    actorUser: IUser,
    selectedNeighborhoodIds: string[] = [],
) {
    await requirePermission(actorUser, "inspections.create");
    const neighborhoodFilter = creationNeighborhoodFilter(actorUser);
    const neighborhoods = await Neighborhood.find(neighborhoodFilter)
        .sort({ sequence: 1, code: 1 })
        .select("code name sequence wardCode wardName");
    const allowedIds = new Set(neighborhoods.map(item => String(item._id)));
    const selectedIds = [...new Set(selectedNeighborhoodIds)];
    if (selectedIds.some(id => !allowedIds.has(id))) {
        throw new HttpError("Có Tổ dân phố nằm ngoài Phường/xã được phân công", 403);
    }
    const houses = selectedIds.length > 0
        ? await HouseRecord.find({ neighborhoodId: { $in: selectedIds } })
              .sort({ code: 1, address: 1 })
              .select("code address cluster neighborhoodId")
        : [];
    return { neighborhoods, houses };
}

export async function createInspectionCampaign(
    actorUser: IUser,
    input: CreateInspectionCampaignInput,
) {
    await requirePermission(actorUser, "inspections.create");
    const neighborhoodIds = [...new Set(input.targetNeighborhoodIds)];
    const neighborhoods = await Neighborhood.find({
        ...creationNeighborhoodFilter(actorUser),
        _id: { $in: neighborhoodIds },
    }).select("_id wardCode wardName");
    if (neighborhoods.length !== neighborhoodIds.length) {
        throw new HttpError("Có Tổ dân phố nằm ngoài Phường/xã được phân công", 403);
    }

    const houseFilter: Record<string, unknown> = {
        neighborhoodId: { $in: neighborhoodIds },
    };
    if (input.targetHouseIds) {
        houseFilter._id = { $in: [...new Set(input.targetHouseIds)] };
    }
    const houses = await HouseRecord.find(houseFilter).select("_id neighborhoodId");
    if (input.targetHouseIds && houses.length !== new Set(input.targetHouseIds).size) {
        throw new HttpError("Có Nhà số không tồn tại hoặc không thuộc Tổ dân phố đã chọn", 422);
    }
    if (houses.length === 0) {
        throw new HttpError("Không có Nhà số nào được chọn cho chiến dịch", 422);
    }

    const wardCodes = new Set(
        neighborhoods.map(item => item.wardCode).filter(value => value !== undefined),
    );
    if (wardCodes.size > 1) {
        throw new HttpError("Một chiến dịch chỉ được giao trong cùng một Phường/xã", 422);
    }
    const wardCode = actorUser.wardCode || [...wardCodes][0];
    const wardName = actorUser.wardName || neighborhoods.find(item => item.wardName)?.wardName;
    const campaign = await InspectionCampaign.create({
        name: input.name,
        purpose: input.purpose,
        checklistTemplate: input.checklistTemplate,
        allowSelfDeclaration: input.allowSelfDeclaration,
        requiredEvidence: input.requiredEvidence,
        startAt: new Date(input.startAt),
        dueAt: new Date(input.dueAt),
        status: "DRAFT",
        wardCode,
        wardName,
        createdByWardUserId: actorUser._id,
    });
    try {
        await InspectionTarget.insertMany(houses.map(house => ({
            campaignId: campaign._id,
            houseId: house._id,
            neighborhoodId: house.neighborhoodId,
            selfDeclarationStatus: "NOT_SENT",
            resultStatus: "PENDING",
        })));
    } catch (err) {
        await campaign.deleteOne();
        throw err;
    }
    await writeAuditLog({
        actorId: actorUser._id,
        action: "inspection.campaign.create",
        targetModel: "InspectionCampaign",
        targetId: campaign._id,
        metadata: {
            neighborhoodIds,
            targetHouseCount: houses.length,
            status: "DRAFT",
        },
    });
    return getInspectionCampaignById(actorUser, String(campaign._id));
}

export async function updateInspectionCampaignChecklist(
    actorUser: IUser,
    campaignId: string,
    input: UpdateInspectionCampaignChecklistInput,
) {
    await requirePermission(actorUser, "inspections.create");
    const campaign = await assertCampaignVisible(actorUser, campaignId);
    if (!actorUser.roles.includes("admin") && !isCampaignCreator(actorUser, campaign)) {
        throw new HttpError("Chỉ người tạo chiến dịch hoặc quản trị viên được sửa checklist", 403);
    }
    if (campaign.status !== "DRAFT") {
        throw new HttpError("Chỉ có thể sửa checklist khi chiến dịch còn ở bản nháp", 409);
    }
    const updated = await InspectionCampaign.findOneAndUpdate(
        { _id: campaignId, status: "DRAFT" },
        { $set: { checklistTemplate: input.checklistTemplate } },
        { new: true },
    );
    if (!updated) throw new HttpError("Chiến dịch vừa được người khác cập nhật", 409);
    await writeAuditLog({
        actorId: actorUser._id,
        action: "inspection.campaign.checklist.update",
        targetModel: "InspectionCampaign",
        targetId: updated._id,
        metadata: { itemCount: input.checklistTemplate.length },
    });
    return getInspectionCampaignById(actorUser, campaignId);
}

async function notifyCampaignDeployment(
    actorUser: IUser,
    campaign: IInspectionCampaign,
) {
    const neighborhoodIds = await InspectionTarget.distinct("neighborhoodId", {
        campaignId: campaign._id,
    });
    const recipients = await User.find({
        status: "active",
        roles: { $in: ["neighborhood_leader", "neighborhood_coleader"] },
        $or: [
            { neighborhoodId: { $in: neighborhoodIds } },
            { assignedNeighborhoodIds: { $in: neighborhoodIds } },
        ],
    }).select("_id");
    if (recipients.length === 0) return;
    await createNotification({
        title: `Chiến dịch mới: ${campaign.name}`,
        body: `Phường giao đợt rà soát, hạn hoàn thành ${campaign.dueAt.toLocaleDateString("vi-VN")}.`,
        type: "inspection.campaign.deployed",
        targetUserIds: recipients.map(item => item._id),
        relatedModel: "InspectionCampaign",
        relatedId: campaign._id,
        createdBy: actorUser._id,
    });
}

async function getInspectionSubmissionRecipients(campaign: IInspectionCampaign) {
    const creatorId = referenceId(campaign.createdByWardUserId);
    const recipientClauses: Record<string, unknown>[] = [{ _id: creatorId }];
    if (campaign.wardCode) {
        recipientClauses.push({
            wardCode: campaign.wardCode,
            roles: { $in: ["secretary", "people_committee_official"] },
        });
    }
    return User.find({
        status: "active",
        $or: recipientClauses,
    })
        .sort({ displayName: 1 })
        .select("displayName roles wardCode wardName");
}

export type InspectionCampaignTransition = "publish" | "lock" | "reopen" | "close";

export async function transitionInspectionCampaign(
    actorUser: IUser,
    campaignId: string,
    action: InspectionCampaignTransition,
) {
    await requirePermission(actorUser, "inspections.manage");
    const campaign = await assertCampaignVisible(actorUser, campaignId);
    if (!actorUser.roles.includes("admin") && !isCampaignCreator(actorUser, campaign)) {
        throw new HttpError("Chỉ người tạo chiến dịch hoặc quản trị viên được quản lý", 403);
    }
    const transition = {
        publish: { from: ["DRAFT"], to: "ACTIVE" },
        lock: { from: ["ACTIVE"], to: "LOCKED" },
        reopen: { from: ["LOCKED"], to: "ACTIVE" },
        close: { from: ["ACTIVE", "LOCKED"], to: "CLOSED" },
    }[action] as { from: string[]; to: "ACTIVE" | "LOCKED" | "CLOSED" };
    if (!transition.from.includes(campaign.status)) {
        throw new HttpError("Chuyển trạng thái chiến dịch không hợp lệ", 409);
    }
    if (action === "publish") {
        const targetCount = await InspectionTarget.countDocuments({ campaignId });
        if (targetCount === 0) throw new HttpError("Chiến dịch chưa có Nhà số mục tiêu", 422);
    }
    const updated = await InspectionCampaign.findOneAndUpdate(
        { _id: campaignId, status: campaign.status },
        { $set: { status: transition.to } },
        { new: true },
    );
    if (!updated) throw new HttpError("Chiến dịch vừa được người khác cập nhật", 409);
    await writeAuditLog({
        actorId: actorUser._id,
        action: "inspection.campaign.status",
        targetModel: "InspectionCampaign",
        targetId: updated._id,
        metadata: { from: campaign.status, to: transition.to, action },
    });
    if (action === "publish" || action === "reopen") {
        await notifyCampaignDeployment(actorUser, updated);
    }
    return getInspectionCampaignById(actorUser, campaignId);
}

export async function listInspectionCampaigns(params: {
    actorUser: IUser;
    page: number;
    limit: number;
    status?: string;
}) {
    const [targetCampaignIds, ownCampaignIds] = await Promise.all([
        InspectionTarget.distinct("campaignId", scopedTargetFilter(params.actorUser)),
        InspectionCampaign.distinct("_id", {
            createdByWardUserId: params.actorUser._id,
        }),
    ]);
    const campaignIds = [...new Map(
        [...targetCampaignIds, ...ownCampaignIds].map(id => [String(id), id]),
    ).values()];
    const filter: Record<string, unknown> = { _id: { $in: campaignIds } };
    if (params.status) filter.status = params.status;
    const [items, total] = await Promise.all([
        InspectionCampaign.find(filter)
            .sort({ dueAt: 1, createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("createdByWardUserId", "displayName"),
        InspectionCampaign.countDocuments(filter),
    ]);
    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getInspectionCampaignById(actorUser: IUser, campaignId: string) {
    const campaign = await assertCampaignVisible(actorUser, campaignId);
    await campaign.populate([
        { path: "createdByWardUserId", select: "displayName wardCode wardName" },
        { path: "neighborhoodSubmissions.submittedByUserId", select: "displayName" },
    ]);
    const scopedTargets = scopedCampaignTargetFilter(
        actorUser,
        campaign,
        { campaignId: campaign._id },
    );
    const [summary, neighborhoodIds, submissionRecipients] = await Promise.all([
        getInspectionSummary(actorUser, campaignId),
        InspectionTarget.distinct("neighborhoodId", scopedTargets),
        getInspectionSubmissionRecipients(campaign),
    ]);
    const availableNeighborhoods = await Neighborhood.find({
        _id: { $in: neighborhoodIds },
    }).select("code name");
    return {
        ...campaign.toObject(),
        summary,
        availableNeighborhoods,
        submissionDestination: {
            wardCode: campaign.wardCode,
            wardName: campaign.wardName,
            recipients: submissionRecipients,
        },
    };
}

export async function listInspectionTargets(params: {
    actorUser: IUser;
    campaignId: string;
    page: number;
    limit: number;
    resultStatus?: string;
    selfDeclarationStatus?: string;
    pendingFilter?: "not_sent" | "unopened" | "not_submitted" | "overdue";
    neighborhoodId?: string;
}) {
    const campaign = await assertCampaignVisible(params.actorUser, params.campaignId);
    const base: FilterQuery<IInspectionTarget> = { campaignId: campaign._id };
    if (params.resultStatus) base.resultStatus = params.resultStatus;
    if (params.selfDeclarationStatus) {
        base.selfDeclarationStatus = params.selfDeclarationStatus;
    }
    if (params.neighborhoodId) base.neighborhoodId = params.neighborhoodId;
    if (params.pendingFilter === "not_sent") base.selfDeclarationStatus = "NOT_SENT";
    if (params.pendingFilter === "unopened") base.openedAt = { $exists: false };
    if (params.pendingFilter === "not_submitted") {
        base.resultStatus = {
            $in: ["PENDING", "DRAFT", "REQUEST_REVISION", "FIELD_CHECK_REQUIRED"],
        };
    }
    if (params.pendingFilter === "overdue") {
        if (campaign.dueAt >= new Date()) base._id = { $in: [] };
        else base.resultStatus = { $ne: "VERIFIED" };
    }
    const filter = scopedCampaignTargetFilter(params.actorUser, campaign, base);
    const [targets, total] = await Promise.all([
        InspectionTarget.find(filter)
            .sort({ resultStatus: 1, createdAt: 1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("houseId", "code address cluster streetId neighborhoodId")
            .populate("assignedCollaboratorUserId", "displayName phone"),
        InspectionTarget.countDocuments(filter),
    ]);
    const resultRows = await InspectionResult.find({
        targetId: { $in: targets.map(target => target._id) },
    }).select("targetId status outcome updatedAt");
    const resultByTarget = new Map(resultRows.map(row => [String(row.targetId), row]));
    return {
        items: targets.map(target => ({
            ...target.toObject(),
            result: resultByTarget.get(String(target._id)) || null,
        })),
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getInspectionTargetById(actorUser: IUser, targetId: string) {
    const target = await InspectionTarget.findById(targetId)
        .populate("houseId", "code address cluster streetId neighborhoodId")
        .populate("assignedCollaboratorUserId", "displayName phone");
    if (!target) throw new HttpError("Không tìm thấy Nhà số cần rà soát", 404);
    await assertTargetInScope(actorUser, target);
    const [campaign, result] = await Promise.all([
        InspectionCampaign.findById(target.campaignId),
        InspectionResult.findOne({ targetId: target._id }).select("_id status outcome updatedAt"),
    ]);
    if (!campaign) throw new HttpError("Không tìm thấy chiến dịch", 404);
    if (!target.openedAt && await userHasPermission(actorUser, "inspections.execute")) {
        target.openedAt = new Date();
        await target.save();
    }
    return { ...target.toObject(), campaign, result };
}

export async function assignInspectionTargets(
    actorUser: IUser,
    campaignId: string,
    input: AssignInspectionTargetsInput,
) {
    await requirePermission(actorUser, "inspections.assign");
    const campaign = await assertCampaignVisible(actorUser, campaignId);
    assertCampaignExecutable(campaign);
    const targets = await InspectionTarget.find({
        _id: { $in: input.targetIds },
        campaignId: campaign._id,
    });
    if (targets.length !== new Set(input.targetIds).size) {
        throw new HttpError("Một hoặc nhiều Nhà số không thuộc chiến dịch", 404);
    }
    for (const target of targets) {
        await assertTargetInScope(actorUser, target);
    }

    const collaborator = await User.findById(input.collaboratorUserId);
    if (!collaborator || collaborator.status !== "active") {
        throw new HttpError("Cộng tác viên không tồn tại hoặc đã bị khóa", 404);
    }
    if (!isCollaborator(collaborator) || !(await userHasPermission(collaborator, "inspections.execute"))) {
        throw new HttpError("Người được giao chưa có vai trò và quyền thực hiện rà soát", 422);
    }
    const collaboratorNeighborhoods = actorNeighborhoodIds(collaborator);
    if (targets.some(target => !collaboratorNeighborhoods.includes(String(target.neighborhoodId)))) {
        throw new HttpError("Cộng tác viên không thuộc Tổ dân phố của Nhà số được chọn", 403);
    }

    for (const target of targets) {
        const previous = target.assignedCollaboratorUserId
            ? String(target.assignedCollaboratorUserId)
            : null;
        target.assignedCollaboratorUserId = collaborator._id as Types.ObjectId;
        await target.save();
        await writeAuditLog({
            actorId: actorUser._id,
            action: "inspection.assigned",
            targetModel: "InspectionTarget",
            targetId: target._id,
            metadata: {
                campaignId,
                targetId: String(target._id),
                neighborhoodId: String(target.neighborhoodId),
                from: previous,
                to: input.collaboratorUserId,
            },
        });
    }
    await createNotification({
        title: `Được giao rà soát: ${campaign.name}`,
        body: `Bạn được giao ${targets.length} Nhà số cần rà soát trước ${campaign.dueAt.toLocaleDateString("vi-VN")}.`,
        type: "inspection.assigned",
        targetUserIds: [collaborator._id],
        relatedModel: "InspectionCampaign",
        relatedId: campaign._id,
        createdBy: actorUser._id,
    });
    return { assignedCount: targets.length };
}

export async function sendInspectionSelfDeclaration(
    actorUser: IUser,
    targetId: string,
) {
    await requirePermission(actorUser, "inspections.assign");
    const target = await scopedTarget(actorUser, targetId);
    const campaign = await campaignForTarget(target);
    assertCampaignExecutable(campaign);
    if (!campaign.allowSelfDeclaration) {
        throw new HttpError("Chiến dịch không cho phép Nhà số tự khai", 409);
    }
    const recipientIds = await getActingOwnerUserIdsForHouses([target.houseId]);
    target.selfDeclarationStatus = "SENT";
    target.selfDeclarationSentAt = new Date();
    await target.save();
    if (recipientIds.length > 0) {
        await createNotification({
            title: `Biểu mẫu tự khai: ${campaign.name}`,
            body: `Vui lòng hoàn thành biểu mẫu trước ${campaign.dueAt.toLocaleDateString("vi-VN")}.`,
            type: "inspection.self_declaration.sent",
            targetUserIds: recipientIds,
            relatedModel: "InspectionTarget",
            relatedId: target._id,
            createdBy: actorUser._id,
        });
    }
    return { target, recipientCount: recipientIds.length };
}

async function houseSelfDeclarationContext(actorUser: IUser, targetId: string) {
    const target = await InspectionTarget.findById(targetId)
        .populate("houseId", "code address cluster neighborhoodId");
    if (!target) throw new HttpError("Không tìm thấy biểu mẫu tự khai", 404);
    if (!await isHouseOwnerActor(referenceId(target.houseId), actorUser._id)) {
        throw new HttpError("Bạn không phải người đang quản lý Nhà số của biểu mẫu này", 403);
    }
    const campaign = await campaignForTarget(target);
    if (!campaign.allowSelfDeclaration) {
        throw new HttpError("Chiến dịch không cho phép Nhà số tự khai", 409);
    }
    if (target.selfDeclarationStatus === "NOT_SENT") {
        throw new HttpError("Biểu mẫu chưa được Tổ dân phố gửi tới Nhà số", 403);
    }
    return { target, campaign };
}

async function houseSelfDeclarationDetails(
    target: IInspectionTarget,
    campaign: IInspectionCampaign,
) {
    const result = await InspectionResult.findOne({ targetId: target._id })
        .populate("submittedByUserId", "displayName")
        .populate("verifiedByUserId", "displayName");
    const [answers, attachments] = result
        ? await Promise.all([
              InspectionAnswer.find({ resultId: result._id }).sort({ createdAt: 1 }),
              FileAsset.find({ relatedModel: "InspectionResult", relatedId: result._id })
                  .sort({ createdAt: -1 })
                  .populate("uploadedBy", "displayName"),
          ])
        : [[], []];
    return {
        target,
        campaign,
        result: result
            ? { ...result.toObject(), answers, attachments }
            : null,
    };
}

export async function listMyInspectionSelfDeclarations(actorUser: IUser) {
    const houseIds = await getHouseIdsForActingOwner(actorUser._id);
    if (houseIds.length === 0) return { items: [] };
    const targets = await InspectionTarget.find({
        houseId: { $in: houseIds },
        selfDeclarationStatus: { $in: ["SENT", "SUBMITTED"] },
    })
        .sort({ updatedAt: -1 })
        .populate("houseId", "code address cluster neighborhoodId");
    const campaigns = await InspectionCampaign.find({
        _id: { $in: targets.map(target => target.campaignId) },
        allowSelfDeclaration: true,
    });
    const campaignById = new Map(campaigns.map(campaign => [String(campaign._id), campaign]));
    return {
        items: targets
            .map(target => ({
                target,
                campaign: campaignById.get(String(target.campaignId)),
            }))
            .filter(item => item.campaign)
            .sort((a, b) => a.campaign!.dueAt.getTime() - b.campaign!.dueAt.getTime()),
    };
}

export async function getHouseInspectionSelfDeclaration(
    actorUser: IUser,
    targetId: string,
) {
    const { target, campaign } = await houseSelfDeclarationContext(actorUser, targetId);
    if (!target.openedAt) {
        target.openedAt = new Date();
        await target.save();
    }
    return houseSelfDeclarationDetails(target, campaign);
}

export async function saveHouseInspectionSelfDeclaration(
    actorUser: IUser,
    targetId: string,
    input: HouseInspectionSelfDeclarationInput,
) {
    const { target, campaign } = await houseSelfDeclarationContext(actorUser, targetId);
    assertCampaignExecutable(campaign);
    validateAnswerItems(campaign, input.answers);
    let result = await InspectionResult.findOne({ targetId: target._id });
    if (result) {
        if (result.submittedBy !== "HOUSE") {
            throw new HttpError("Tổ dân phố đã lập kết quả cho Nhà số này", 409);
        }
        if (!HOUSE_MUTABLE_RESULT_STATUSES.includes(result.status)) {
            throw new HttpError("Biểu mẫu đã gửi hoặc đã xác minh, không thể ghi đè", 409);
        }
        result.note = input.note;
        result.submittedByUserId = actorUser._id as Types.ObjectId;
        await result.save();
    } else {
        result = await InspectionResult.create({
            targetId: target._id,
            submittedBy: "HOUSE",
            submittedByUserId: actorUser._id,
            note: input.note,
            status: "DRAFT",
        });
    }
    await persistAnswers(result._id as Types.ObjectId, input.answers);
    target.resultStatus = result.status;
    target.openedAt ||= new Date();
    await target.save();
    return houseSelfDeclarationDetails(target, campaign);
}

export async function submitHouseInspectionSelfDeclaration(
    actorUser: IUser,
    targetId: string,
) {
    const { target, campaign } = await houseSelfDeclarationContext(actorUser, targetId);
    assertCampaignExecutable(campaign);
    const current = await InspectionResult.findOne({ targetId: target._id });
    if (!current || current.submittedBy !== "HOUSE") {
        throw new HttpError("Hãy lưu bản nháp biểu mẫu trước khi gửi", 409);
    }
    if (!HOUSE_MUTABLE_RESULT_STATUSES.includes(current.status)) {
        throw new HttpError("Biểu mẫu không còn ở trạng thái có thể gửi", 409);
    }
    await assertResultComplete(campaign, current);
    const result = await InspectionResult.findOneAndUpdate(
        { _id: current._id, status: { $in: HOUSE_MUTABLE_RESULT_STATUSES } },
        { $set: { status: "SUBMITTED", submittedAt: new Date() } },
        { new: true },
    );
    if (!result) throw new HttpError("Biểu mẫu vừa được cập nhật ở nơi khác", 409);
    target.resultStatus = "SUBMITTED";
    target.selfDeclarationStatus = "SUBMITTED";
    await target.save();
    await writeAuditLog({
        actorId: actorUser._id,
        action: "inspection.self_declaration.submit",
        targetModel: "InspectionResult",
        targetId: result._id,
        metadata: {
            campaignId: String(campaign._id),
            inspectionTargetId: String(target._id),
            houseId: referenceId(target.houseId),
        },
    });
    return houseSelfDeclarationDetails(target, campaign);
}

function validateAnswerItems(
    campaign: IInspectionCampaign,
    answers: SaveInspectionResultInput["answers"],
) {
    const validIds = new Set(campaign.checklistTemplate.map(item => item.itemId));
    const submittedIds = new Set<string>();
    for (const answer of answers) {
        if (!validIds.has(answer.checklistItemId)) {
            throw new HttpError(`Mục checklist không tồn tại: ${answer.checklistItemId}`, 422);
        }
        if (submittedIds.has(answer.checklistItemId)) {
            throw new HttpError(`Mục checklist bị trả lời trùng: ${answer.checklistItemId}`, 422);
        }
        submittedIds.add(answer.checklistItemId);
    }
}

async function persistAnswers(
    resultId: Types.ObjectId,
    answers: SaveInspectionResultInput["answers"],
) {
    if (answers.length === 0) {
        await InspectionAnswer.deleteMany({ resultId });
        return;
    }
    await InspectionAnswer.bulkWrite(
        answers.map(answer => ({
            updateOne: {
                filter: { resultId, checklistItemId: answer.checklistItemId },
                update: { $set: { value: answer.value } },
                upsert: true,
            },
        })),
    );
    await InspectionAnswer.deleteMany({
        resultId,
        checklistItemId: { $nin: answers.map(answer => answer.checklistItemId) },
    });
}

export async function createInspectionResult(
    actorUser: IUser,
    input: SaveInspectionResultInput,
) {
    await requirePermission(actorUser, "inspections.execute");
    const target = await scopedTarget(actorUser, input.targetId);
    const campaign = await campaignForTarget(target);
    assertCampaignExecutable(campaign);
    validateAnswerItems(campaign, input.answers);
    if (await InspectionResult.exists({ targetId: target._id })) {
        throw new HttpError("Nhà số đã có kết quả; hãy cập nhật bản hiện có", 409);
    }
    const result = await InspectionResult.create({
        targetId: target._id,
        submittedBy: "NEIGHBORHOOD",
        submittedByUserId: actorUser._id,
        gpsLat: input.gpsLat,
        gpsLng: input.gpsLng,
        note: input.note,
        outcome: input.outcome,
        status: "DRAFT",
    });
    await persistAnswers(result._id as Types.ObjectId, input.answers);
    target.resultStatus = "DRAFT";
    target.openedAt ||= new Date();
    await target.save();
    return getInspectionResult(actorUser, String(result._id));
}

export async function getInspectionResult(actorUser: IUser, resultId: string) {
    const result = await InspectionResult.findById(resultId)
        .populate("submittedByUserId", "displayName")
        .populate("verifiedByUserId", "displayName");
    if (!result) throw new HttpError("Không tìm thấy kết quả rà soát", 404);
    const target = await InspectionTarget.findById(result.targetId)
        .populate("houseId", "code address cluster neighborhoodId")
        .populate("assignedCollaboratorUserId", "displayName phone");
    if (!target) throw new HttpError("Không tìm thấy Nhà số cần rà soát", 404);
    await assertTargetInScope(actorUser, target);
    const [answers, attachments, campaign] = await Promise.all([
        InspectionAnswer.find({ resultId: result._id }).sort({ createdAt: 1 }),
        FileAsset.find({ relatedModel: "InspectionResult", relatedId: result._id })
            .sort({ createdAt: -1 })
            .populate("uploadedBy", "displayName"),
        InspectionCampaign.findById(target.campaignId),
    ]);
    return { ...result.toObject(), target, campaign, answers, attachments };
}

export async function updateInspectionResult(
    actorUser: IUser,
    resultId: string,
    input: UpdateInspectionResultInput,
) {
    await requirePermission(actorUser, "inspections.execute");
    const result = await InspectionResult.findById(resultId);
    if (!result) throw new HttpError("Không tìm thấy kết quả rà soát", 404);
    const target = await scopedTarget(actorUser, String(result.targetId));
    const campaign = await campaignForTarget(target);
    assertCampaignExecutable(campaign);
    if (!MUTABLE_RESULT_STATUSES.includes(result.status)) {
        throw new HttpError("Kết quả đã gửi hoặc đã xác minh, không thể ghi đè", 409);
    }
    validateAnswerItems(campaign, input.answers);
    result.gpsLat = input.gpsLat;
    result.gpsLng = input.gpsLng;
    result.note = input.note;
    result.outcome = input.outcome;
    result.submittedByUserId = actorUser._id as Types.ObjectId;
    await result.save();
    await persistAnswers(result._id as Types.ObjectId, input.answers);
    return getInspectionResult(actorUser, resultId);
}

function isEmptyRequiredValue(value: unknown): boolean {
    return value === undefined || value === null || value === "" ||
        (Array.isArray(value) && value.length === 0);
}

async function assertResultComplete(
    campaign: IInspectionCampaign,
    result: IInspectionResult,
) {
    const answers = await InspectionAnswer.find({ resultId: result._id });
    const answerMap = new Map(answers.map(answer => [answer.checklistItemId, answer.value]));
    const missing = campaign.checklistTemplate.filter(
        item => item.required && isEmptyRequiredValue(answerMap.get(item.itemId)),
    );
    if (missing.length > 0) {
        throw new HttpError(`Chưa trả lời mục bắt buộc: ${missing.map(item => item.label).join(", ")}`, 422);
    }
    if (campaign.requiredEvidence) {
        const evidenceCount = await FileAsset.countDocuments({
            relatedModel: "InspectionResult",
            relatedId: result._id,
        });
        if (evidenceCount === 0) {
            throw new HttpError("Chiến dịch yêu cầu ít nhất một ảnh hoặc tệp minh chứng", 422);
        }
    }
}

export async function submitInspectionResult(actorUser: IUser, resultId: string) {
    await requirePermission(actorUser, "inspections.execute");
    const result = await InspectionResult.findById(resultId);
    if (!result) throw new HttpError("Không tìm thấy kết quả rà soát", 404);
    const target = await scopedTarget(actorUser, String(result.targetId));
    const campaign = await campaignForTarget(target);
    assertCampaignExecutable(campaign);
    if (!MUTABLE_RESULT_STATUSES.includes(result.status)) {
        throw new HttpError("Chỉ bản nháp hoặc kết quả cần kiểm tra thực địa mới được gửi", 409);
    }
    await assertResultComplete(campaign, result);
    result.status = "SUBMITTED";
    result.submittedAt = new Date();
    await result.save();
    target.resultStatus = "SUBMITTED";
    if (result.submittedBy === "HOUSE") target.selfDeclarationStatus = "SUBMITTED";
    await target.save();
    return getInspectionResult(actorUser, resultId);
}

async function reviewInspectionResult(
    actorUser: IUser,
    resultId: string,
    nextStatus: "VERIFIED" | "REQUEST_REVISION" | "FIELD_CHECK_REQUIRED",
    input: InspectionReviewInput,
) {
    await requirePermission(actorUser, "inspections.verify");
    const current = await InspectionResult.findById(resultId);
    if (!current) throw new HttpError("Không tìm thấy kết quả rà soát", 404);
    const target = await scopedTarget(actorUser, String(current.targetId));
    const campaign = await campaignForTarget(target);
    assertCampaignExecutable(campaign);
    const allowedFrom: InspectionResultStatus[] =
        nextStatus === "VERIFIED" ? ["SUBMITTED", "FIELD_CHECK_REQUIRED"] : ["SUBMITTED"];
    if (!allowedFrom.includes(current.status)) {
        throw new HttpError("Chuyển trạng thái kết quả không hợp lệ", 409);
    }
    if (nextStatus !== "VERIFIED" && !input.note) {
        throw new HttpError("Vui lòng nhập lý do hoặc nội dung cần bổ sung", 422);
    }
    if (nextStatus === "VERIFIED") await assertResultComplete(campaign, current);

    const update: Record<string, unknown> = {
        status: nextStatus,
        reviewNote: input.note,
    };
    if (input.outcome !== undefined) update.outcome = input.outcome;
    if (nextStatus === "VERIFIED") {
        update.verifiedByUserId = actorUser._id;
        update.verifiedAt = new Date();
    }
    const result = await InspectionResult.findOneAndUpdate(
        { _id: resultId, status: { $in: allowedFrom } },
        { $set: update },
        { new: true },
    );
    if (!result) throw new HttpError("Kết quả vừa được người khác xử lý", 409);
    target.resultStatus = nextStatus;
    await target.save();
    await writeAuditLog({
        actorId: actorUser._id,
        action: "inspection.result.review",
        targetModel: "InspectionResult",
        targetId: result._id,
        metadata: {
            campaignId: String(campaign._id),
            targetId: String(target._id),
            neighborhoodId: String(target.neighborhoodId),
            from: current.status,
            to: nextStatus,
            note: input.note,
        },
    });
    const recipientIds = await getActingOwnerUserIdsForHouses([target.houseId]);
    if (recipientIds.length > 0) {
        const title = nextStatus === "VERIFIED"
            ? "Kết quả tự khai đã được xác minh"
            : nextStatus === "REQUEST_REVISION"
              ? "Kết quả tự khai cần bổ sung"
              : "Nhà số cần kiểm tra thực địa";
        await createNotification({
            title,
            body: input.note || campaign.name,
            type: `inspection.result.${nextStatus.toLowerCase()}`,
            targetUserIds: recipientIds,
            relatedModel: "InspectionTarget",
            relatedId: target._id,
            createdBy: actorUser._id,
        });
    }
    return getInspectionResult(actorUser, resultId);
}

export const verifyInspectionResult = (
    actorUser: IUser,
    resultId: string,
    input: InspectionReviewInput,
) => reviewInspectionResult(actorUser, resultId, "VERIFIED", input);

export const requestInspectionRevision = (
    actorUser: IUser,
    resultId: string,
    input: InspectionReviewInput,
) => reviewInspectionResult(actorUser, resultId, "REQUEST_REVISION", input);

export const requireInspectionFieldCheck = (
    actorUser: IUser,
    resultId: string,
    input: InspectionReviewInput,
) => reviewInspectionResult(actorUser, resultId, "FIELD_CHECK_REQUIRED", input);

export async function getInspectionSummary(
    actorUser: IUser,
    campaignId: string,
    neighborhoodId?: string,
) {
    const campaign = await assertCampaignVisible(actorUser, campaignId);
    const base: FilterQuery<IInspectionTarget> = { campaignId: campaign._id };
    if (neighborhoodId) base.neighborhoodId = neighborhoodId;
    const targets = await InspectionTarget.find(
        scopedCampaignTargetFilter(actorUser, campaign, base),
    ).select("resultStatus");
    const counts: Record<string, number> = {
        totalHouses: targets.length,
        pass: 0,
        fail: 0,
        unchecked: 0,
        needsSupplement: 0,
        pending: 0,
        draft: 0,
        submitted: 0,
        verified: 0,
    };
    for (const target of targets) {
        const key = target.resultStatus.toLowerCase();
        if (key in counts) counts[key] += 1;
        if (target.resultStatus === "PENDING" || target.resultStatus === "DRAFT") {
            counts.unchecked += 1;
        }
        if (["REQUEST_REVISION", "FIELD_CHECK_REQUIRED"].includes(target.resultStatus)) {
            counts.needsSupplement += 1;
        }
    }
    const results = await InspectionResult.find({
        targetId: { $in: targets.map(target => target._id) },
        status: "VERIFIED",
    }).select("outcome");
    for (const result of results) {
        if (result.outcome === "PASS") counts.pass += 1;
        else if (result.outcome === "FAIL") counts.fail += 1;
        else if (result.outcome === "NEEDS_SUPPLEMENT") counts.needsSupplement += 1;
    }
    return counts;
}

export async function remindInspectionTargets(
    actorUser: IUser,
    campaignId: string,
    input: RemindInspectionInput,
) {
    await requirePermission(actorUser, "inspections.assign");
    const campaign = await assertCampaignVisible(actorUser, campaignId);
    assertCampaignExecutable(campaign);
    const base: FilterQuery<IInspectionTarget> = {
        campaignId: campaign._id,
        resultStatus: { $ne: "VERIFIED" },
    };
    if (input.targetIds) base._id = { $in: input.targetIds };
    const targets = await InspectionTarget.find(
        scopedCampaignTargetFilter(actorUser, campaign, base),
    );
    if (input.targetIds && targets.length !== new Set(input.targetIds).size) {
        throw new HttpError("Một hoặc nhiều Nhà số nằm ngoài phạm vi được nhắc", 403);
    }
    const ownerIds = await getActingOwnerUserIdsForHouses(targets.map(target => target.houseId));
    const collaboratorIds = targets
        .map(target => target.assignedCollaboratorUserId)
        .filter(Boolean) as Types.ObjectId[];
    const recipientIds = [...new Map(
        [...ownerIds, ...collaboratorIds].map(id => [String(id), id]),
    ).values()];
    if (recipientIds.length > 0) {
        await createNotification({
            title: `Nhắc thực hiện: ${campaign.name}`,
            body: input.message || `Vui lòng hoàn thành trước ${campaign.dueAt.toLocaleDateString("vi-VN")}.`,
            type: "inspection.reminder",
            targetUserIds: recipientIds,
            relatedModel: "InspectionCampaign",
            relatedId: campaign._id,
            createdBy: actorUser._id,
        });
    }
    return { targetCount: targets.length, recipientCount: recipientIds.length };
}

function resolveSubmissionNeighborhood(
    actorUser: IUser,
    requestedNeighborhoodId?: string,
): string {
    if (requestedNeighborhoodId) {
        if (
            !actorUser.roles.includes("admin") &&
            !actorNeighborhoodIds(actorUser).includes(requestedNeighborhoodId)
        ) {
            throw new HttpError("Tổ dân phố nằm ngoài phạm vi được phân công", 403);
        }
        return requestedNeighborhoodId;
    }
    const ids = actorNeighborhoodIds(actorUser);
    if (ids.length !== 1) {
        throw new HttpError("Vui lòng chọn Tổ dân phố cần nộp tổng hợp", 422);
    }
    return ids[0];
}

export async function submitInspectionToWard(
    actorUser: IUser,
    campaignId: string,
    input: SubmitInspectionToWardInput,
) {
    await requirePermission(actorUser, "inspections.submit_to_ward");
    const campaign = await assertCampaignVisible(actorUser, campaignId);
    assertCampaignExecutable(campaign);
    const neighborhoodId = resolveSubmissionNeighborhood(actorUser, input.neighborhoodId);
    const targetExists = await InspectionTarget.exists({ campaignId, neighborhoodId });
    if (!targetExists) throw new HttpError("Chiến dịch không giao Nhà số cho Tổ dân phố này", 404);
    const summary = await getInspectionSummary(actorUser, campaignId, neighborhoodId);
    const submission = {
        neighborhoodId: new Types.ObjectId(neighborhoodId),
        submittedByUserId: actorUser._id as Types.ObjectId,
        submittedAt: new Date(),
        summary,
    };
    const existingIndex = campaign.neighborhoodSubmissions.findIndex(
        item => String(item.neighborhoodId) === neighborhoodId,
    );
    if (existingIndex >= 0) campaign.neighborhoodSubmissions[existingIndex] = submission;
    else campaign.neighborhoodSubmissions.push(submission);
    campaign.markModified("neighborhoodSubmissions");
    await campaign.save();
    const recipients = await getInspectionSubmissionRecipients(campaign);
    if (recipients.length > 0) {
        await createNotification({
            title: `Tổ dân phố đã nộp tổng hợp: ${campaign.name}`,
            body: `Đã tổng hợp ${summary.totalHouses} Nhà số, ${summary.verified} kết quả đã xác minh.`,
            type: "inspection.submitted_to_ward",
            targetUserIds: recipients.map(recipient => recipient._id),
            relatedModel: "InspectionCampaign",
            relatedId: campaign._id,
            createdBy: actorUser._id,
        });
    }
    await writeAuditLog({
        actorId: actorUser._id,
        action: "inspection.submitted_to_ward",
        targetModel: "InspectionCampaign",
        targetId: campaign._id,
        metadata: {
            campaignId,
            neighborhoodId,
            summary,
            recipientUserIds: recipients.map(recipient => String(recipient._id)),
        },
    });
    return {
        ...submission,
        destination: {
            wardCode: campaign.wardCode,
            wardName: campaign.wardName,
            recipients,
        },
    };
}

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];

async function persistInspectionAttachment(
    actorUser: IUser,
    campaign: IInspectionCampaign,
    result: IInspectionResult,
    file: File,
) {
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new HttpError("Tệp vượt quá dung lượng cho phép (tối đa 10MB)", 400);
    }
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
        throw new HttpError("Chỉ chấp nhận JPG, PNG hoặc PDF", 400);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await saveUploadedFile(
        buffer,
        file.name,
        `inspections/${String(campaign._id)}/${String(result._id)}`,
    );
    const asset = await FileAsset.create({
        name: file.name,
        url,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        category: "attachment",
        relatedModel: "InspectionResult",
        relatedId: result._id,
        isPublic: false,
        audienceAll: false,
        targetRoles: [],
        uploadedBy: actorUser._id,
    });
    await writeAuditLog({
        actorId: actorUser._id,
        action: "inspection.attachment.upload",
        targetModel: "InspectionResult",
        targetId: result._id,
        metadata: { fileAssetId: String(asset._id), name: file.name },
    });
    return asset;
}

export async function uploadInspectionAttachment(
    actorUser: IUser,
    resultId: string,
    file: File,
) {
    await requirePermission(actorUser, "inspections.execute");
    const result = await InspectionResult.findById(resultId);
    if (!result) throw new HttpError("Không tìm thấy kết quả rà soát", 404);
    const target = await scopedTarget(actorUser, String(result.targetId));
    const campaign = await campaignForTarget(target);
    assertCampaignExecutable(campaign);
    if (!MUTABLE_RESULT_STATUSES.includes(result.status)) {
        throw new HttpError("Không thể thêm minh chứng vào kết quả đã gửi hoặc xác minh", 409);
    }
    return persistInspectionAttachment(actorUser, campaign, result, file);
}

export async function uploadHouseInspectionAttachment(
    actorUser: IUser,
    targetId: string,
    file: File,
) {
    const { target, campaign } = await houseSelfDeclarationContext(actorUser, targetId);
    assertCampaignExecutable(campaign);
    const result = await InspectionResult.findOne({ targetId: target._id });
    if (!result || result.submittedBy !== "HOUSE") {
        throw new HttpError("Hãy lưu bản nháp trước khi thêm minh chứng", 409);
    }
    if (!HOUSE_MUTABLE_RESULT_STATUSES.includes(result.status)) {
        throw new HttpError("Không thể thêm minh chứng vào biểu mẫu đã gửi hoặc xác minh", 409);
    }
    return persistInspectionAttachment(actorUser, campaign, result, file);
}
