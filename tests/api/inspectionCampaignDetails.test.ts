import { describe, expect, it } from "vitest";
import { InspectionCampaign } from "@/models";
import { updateInspectionCampaignDetails } from "@/services/inspectionService";
import { createTestUser } from "../helpers";

async function draftCampaign(status: "DRAFT" | "ACTIVE" = "DRAFT") {
    const admin = await createTestUser({ roles: ["admin"] });
    const campaign = await InspectionCampaign.create({
        name: "Rà soát thử nghiệm",
        purpose: "Kiểm tra sửa thời hạn",
        checklistTemplate: [
            { itemId: "safe", label: "Đảm bảo an toàn", inputType: "BOOLEAN", required: true },
        ],
        startAt: new Date("2026-10-01T01:00:00.000Z"),
        dueAt: new Date("2026-10-10T10:00:00.000Z"),
        status,
        createdByWardUserId: admin._id,
    });
    return { admin, campaign };
}

describe("Sua thong tin chien dich ra soat (ten, muc tieu, thoi gian)", () => {
    it("doi duoc thoi han cua chien dich ban nhap, bo trong thi giu nguyen", async () => {
        const { admin, campaign } = await draftCampaign();
        await updateInspectionCampaignDetails(admin, String(campaign._id), {
            name: "Tên mới",
            purpose: "Mục tiêu mới",
            dueAt: "2026-10-20T10:00:00.000Z",
        });
        const reloaded = await InspectionCampaign.findById(campaign._id);
        expect(reloaded!.name).toBe("Tên mới");
        expect(reloaded!.dueAt.toISOString()).toBe("2026-10-20T10:00:00.000Z");
        expect(reloaded!.startAt.toISOString()).toBe("2026-10-01T01:00:00.000Z");
    });

    it("tu choi thoi han truoc thoi diem bat dau (so voi gia tri dang luu)", async () => {
        const { admin, campaign } = await draftCampaign();
        await expect(
            updateInspectionCampaignDetails(admin, String(campaign._id), {
                name: campaign.name,
                purpose: campaign.purpose,
                dueAt: "2026-09-30T10:00:00.000Z",
            }),
        ).rejects.toMatchObject({ status: 422 });
    });

    it("khong sua duoc khi chien dich da trien khai", async () => {
        const { admin, campaign } = await draftCampaign("ACTIVE");
        await expect(
            updateInspectionCampaignDetails(admin, String(campaign._id), {
                name: campaign.name,
                purpose: campaign.purpose,
                dueAt: "2026-10-20T10:00:00.000Z",
            }),
        ).rejects.toMatchObject({ status: 409 });
    });
});
