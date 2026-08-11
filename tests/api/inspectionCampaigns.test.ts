import { describe, expect, it } from "vitest";
import {
    AuditLog,
    HouseOwnership,
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
    createInspectionCampaign,
    createInspectionResult,
    getHouseInspectionSelfDeclaration,
    listMyInspectionSelfDeclarations,
    listInspectionTargets,
    requestInspectionRevision,
    saveHouseInspectionSelfDeclaration,
    sendInspectionSelfDeclaration,
    submitHouseInspectionSelfDeclaration,
    submitInspectionResult,
    transitionInspectionCampaign,
    verifyInspectionResult,
} from "@/services/inspectionService";
import type { CreateInspectionCampaignInput } from "@/validators/inspection";
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
        houseA,
        houseB,
        neighborhoodA,
        neighborhoodB,
        campaign,
        targetA,
        targetB,
        leaderA,
    };
}

describe("B07 inspection campaign security and workflow", () => {
    it("cho chủ Nhà số mở, lưu và gửi biểu mẫu tự khai mà không cần quyền của Tổ", async () => {
        const data = await fixture();
        const owner = await createTestUser({ roles: ["house_owner"] });
        const unrelatedOwner = await createTestUser({ roles: ["house_owner"] });
        await HouseOwnership.create({
            houseId: data.houseA._id,
            ownerType: "user",
            ownerId: owner._id,
            relationshipType: "primary_owner",
            active: true,
            verificationStatus: "verified",
        });

        await sendInspectionSelfDeclaration(data.leaderA, String(data.targetA._id));
        const list = await listMyInspectionSelfDeclarations(owner);
        expect(list.items).toHaveLength(1);
        expect(String(list.items[0].target._id)).toBe(String(data.targetA._id));

        await expect(getHouseInspectionSelfDeclaration(
            unrelatedOwner,
            String(data.targetA._id),
        )).rejects.toMatchObject({ status: 403 });

        const opened = await getHouseInspectionSelfDeclaration(owner, String(data.targetA._id));
        expect(opened.result).toBeNull();
        const saved = await saveHouseInspectionSelfDeclaration(
            owner,
            String(data.targetA._id),
            { answers: [{ checklistItemId: "safe", value: true }] },
        );
        expect(saved.result?.submittedBy).toBe("HOUSE");
        expect(saved.result?.status).toBe("DRAFT");

        const submitted = await submitHouseInspectionSelfDeclaration(
            owner,
            String(data.targetA._id),
        );
        expect(submitted.result?.status).toBe("SUBMITTED");
        expect(submitted.target.selfDeclarationStatus).toBe("SUBMITTED");

        await requestInspectionRevision(data.leaderA, String(submitted.result?._id), {
            note: "Vui lòng kiểm tra và khai lại",
        });
        const revised = await saveHouseInspectionSelfDeclaration(
            owner,
            String(data.targetA._id),
            { answers: [{ checklistItemId: "safe", value: false }] },
        );
        expect(revised.result?.status).toBe("REQUEST_REVISION");
        const resubmitted = await submitHouseInspectionSelfDeclaration(
            owner,
            String(data.targetA._id),
        );
        expect(resubmitted.result?.status).toBe("SUBMITTED");
    });

    it("chỉ tạo chiến dịch trong đúng Phường và chỉ chủ chiến dịch được phát hành", async () => {
        const wardCode = 70001;
        const creator = await createTestUser({
            roles: ["secretary"],
            wardCode,
            wardName: "Phường kiểm thử",
        });
        const otherManager = await createTestUser({
            roles: ["people_committee_official"],
            wardCode,
            wardName: "Phường kiểm thử",
        });
        const [insideNeighborhood, outsideNeighborhood] = await Neighborhood.create([
            {
                name: "Tổ trong Phường",
                code: "INS-CREATE-IN",
                sequence: 811,
                wardCode,
                wardName: "Phường kiểm thử",
                active: true,
            },
            {
                name: "Tổ ngoài Phường",
                code: "INS-CREATE-OUT",
                sequence: 812,
                wardCode: 70002,
                wardName: "Phường khác",
                active: true,
            },
        ]);
        const house = await HouseRecord.create({
            code: "INS-CREATE-HOUSE",
            cluster: "Cụm kiểm thử",
            address: "12 đường kiểm thử",
            neighborhoodId: insideNeighborhood._id,
        });
        const input: CreateInspectionCampaignInput = {
            name: "Rà soát do Phường tạo",
            purpose: "Kiểm tra quyền tạo và phạm vi dữ liệu",
            checklistTemplate: [{
                itemId: "fire-safety",
                label: "Đảm bảo điều kiện PCCC",
                inputType: "BOOLEAN",
                required: true,
            }],
            allowSelfDeclaration: false,
            requiredEvidence: true,
            startAt: new Date(Date.now() + 60_000).toISOString(),
            dueAt: new Date(Date.now() + 86_400_000).toISOString(),
            targetNeighborhoodIds: [String(insideNeighborhood._id)],
            targetHouseIds: [String(house._id)],
        };

        const created = await createInspectionCampaign(creator, input);
        expect(created.status).toBe("DRAFT");
        expect(created.wardCode).toBe(wardCode);
        expect(created.summary.totalHouses).toBe(1);
        expect(await InspectionTarget.countDocuments({ campaignId: created._id })).toBe(1);

        await expect(createInspectionCampaign(creator, {
            ...input,
            targetNeighborhoodIds: [String(outsideNeighborhood._id)],
            targetHouseIds: undefined,
        })).rejects.toMatchObject({ status: 403 });

        await expect(transitionInspectionCampaign(
            otherManager,
            String(created._id),
            "publish",
        )).rejects.toMatchObject({ status: 403 });

        const published = await transitionInspectionCampaign(
            creator,
            String(created._id),
            "publish",
        );
        expect(published.status).toBe("ACTIVE");
        expect(await AuditLog.countDocuments({
            action: "inspection.campaign.status",
            targetId: created._id,
        })).toBe(1);
    });

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
