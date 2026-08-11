import { describe, expect, it } from "vitest";
import {
    AuditLog,
    HouseRecord,
    InspectionAnswer,
    InspectionCampaign,
    InspectionResult,
    InspectionTarget,
    Neighborhood,
    Role,
} from "@/models";
import {
    assignInspectionTargets,
    createInspectionResult,
    listInspectionTargets,
    submitInspectionResult,
    verifyInspectionResult,
} from "@/services/inspectionService";
import { createTestUser } from "../helpers";

async function fixture(options: { requiredEvidence?: boolean; status?: "ACTIVE" | "LOCKED" } = {}) {
    const wardUser = await createTestUser({ roles: ["admin"] });
    const [neighborhoodA, neighborhoodB] = await Neighborhood.create([
        { name: "Tổ A", code: "INS-A", sequence: 801 },
        { name: "Tổ B", code: "INS-B", sequence: 802 },
    ]);
    const [houseA, houseB] = await HouseRecord.create([
        { code: "INS-HA", cluster: "Cụm A", address: "1 đường A", neighborhoodId: neighborhoodA._id },
        { code: "INS-HB", cluster: "Cụm B", address: "1 đường B", neighborhoodId: neighborhoodB._id },
    ]);
    const campaign = await InspectionCampaign.create({
        name: "Rà soát thử nghiệm",
        purpose: "Kiểm tra workflow và phân quyền",
        checklistTemplate: [
            { itemId: "safe", label: "Đảm bảo an toàn", inputType: "BOOLEAN", required: true },
        ],
        allowSelfDeclaration: true,
        requiredEvidence: options.requiredEvidence || false,
        startAt: new Date(Date.now() - 60_000),
        dueAt: new Date(Date.now() + 86_400_000),
        status: options.status || "ACTIVE",
        createdByWardUserId: wardUser._id,
    });
    const [targetA, targetB] = await InspectionTarget.create([
        { campaignId: campaign._id, houseId: houseA._id, neighborhoodId: neighborhoodA._id },
        { campaignId: campaign._id, houseId: houseB._id, neighborhoodId: neighborhoodB._id },
    ]);
    const leaderA = await createTestUser({
        roles: ["neighborhood_leader"],
        neighborhoodId: neighborhoodA._id,
    });
    return {
        wardUser,
        neighborhoodA,
        neighborhoodB,
        campaign,
        targetA,
        targetB,
        leaderA,
    };
}

describe("B07 inspection campaign security and workflow", () => {
    it("không làm lộ hoặc cho giao target chéo Tổ dân phố", async () => {
        const data = await fixture();
        const list = await listInspectionTargets({
            actorUser: data.leaderA,
            campaignId: String(data.campaign._id),
            page: 1,
            limit: 20,
        });
        expect(list.items.map(item => String(item._id))).toEqual([String(data.targetA._id)]);

        await expect(assignInspectionTargets(
            data.leaderA,
            String(data.campaign._id),
            {
                targetIds: [String(data.targetB._id)],
                collaboratorUserId: String(data.wardUser._id),
            },
        )).rejects.toMatchObject({ status: 403 });
    });

    it("cộng tác viên chỉ thực hiện target được giao và không thể xác minh", async () => {
        const data = await fixture();
        await Role.create({
            key: "neighborhood_collaborator",
            name: "Cộng tác viên",
            permissions: ["inspections.read", "inspections.execute"],
            active: true,
        });
        const collaborator = await createTestUser({
            roles: ["neighborhood_collaborator"],
            assignedNeighborhoodIds: [data.neighborhoodA._id],
        });
        data.targetA.assignedCollaboratorUserId = collaborator._id;
        data.targetA.resultStatus = "SUBMITTED";
        await data.targetA.save();
        const result = await InspectionResult.create({
            targetId: data.targetA._id,
            submittedBy: "NEIGHBORHOOD",
            submittedByUserId: collaborator._id,
            status: "SUBMITTED",
            outcome: "PASS",
        });

        await expect(verifyInspectionResult(collaborator, String(result._id), {
            outcome: "PASS",
        })).rejects.toMatchObject({ status: 403 });
        expect(await AuditLog.countDocuments({ action: "inspection.result.review" })).toBe(0);
    });

    it("chặn xác minh lần hai và chỉ ghi một audit log", async () => {
        const data = await fixture();
        data.targetA.resultStatus = "SUBMITTED";
        await data.targetA.save();
        const result = await InspectionResult.create({
            targetId: data.targetA._id,
            submittedBy: "NEIGHBORHOOD",
            submittedByUserId: data.leaderA._id,
            status: "SUBMITTED",
            outcome: "PASS",
        });
        await InspectionAnswer.create({
            resultId: result._id,
            checklistItemId: "safe",
            value: true,
        });

        await verifyInspectionResult(data.leaderA, String(result._id), { outcome: "PASS" });
        await expect(
            verifyInspectionResult(data.leaderA, String(result._id), { outcome: "PASS" }),
        ).rejects.toMatchObject({ status: 409 });
        expect(await AuditLog.countDocuments({
            action: "inspection.result.review",
            targetId: result._id,
        })).toBe(1);
    });

    it("không cho sửa chiến dịch đã khóa", async () => {
        const data = await fixture({ status: "LOCKED" });
        await expect(createInspectionResult(data.leaderA, {
            targetId: String(data.targetA._id),
            answers: [{ checklistItemId: "safe", value: true }],
            outcome: "PASS",
        })).rejects.toMatchObject({ status: 409 });
    });

    it("chặn submit khi chiến dịch bắt buộc minh chứng nhưng chưa có tệp", async () => {
        const data = await fixture({ requiredEvidence: true });
        const saved = await createInspectionResult(data.leaderA, {
            targetId: String(data.targetA._id),
            answers: [{ checklistItemId: "safe", value: true }],
            outcome: "PASS",
        });
        await expect(
            submitInspectionResult(data.leaderA, String(saved._id)),
        ).rejects.toMatchObject({ status: 422 });
    });
});
