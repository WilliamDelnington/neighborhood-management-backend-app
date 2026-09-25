import { describe, it, expect } from "vitest";
import { GET as listSurveysRoute, POST as createSurveyRoute } from "@/app/api/surveys/route";
import { POST as openSurveyRoute } from "@/app/api/surveys/[id]/open/route";
import { POST as closeSurveyRoute } from "@/app/api/surveys/[id]/close/route";
import { GET as surveyOverviewRoute } from "@/app/api/surveys/[id]/overview/route";
import { Notification, NotificationDelivery, Role } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

// Vai tro tu tao (khong phai admin) co pham vi du lieu KHONG GIOI HAN - kiem
// tra hasUnlimitedScope doc Role.scopeType thay vi hardcode ten vai tro.
async function createUnlimitedViewer() {
    await Role.create({
        key: "ward_director",
        name: "Giám đốc toàn hệ thống",
        permissions: ["surveys.read", "surveys.publish"],
        scopeType: "ALL",
        system: false,
        active: true,
    });
    return createTestUser({ roles: ["ward_director" as never] });
}

async function createDraftSurvey(
    creatorHeaders: Record<string, string>,
    coEditorUserIds: string[],
) {
    const res = await readJson(
        await createSurveyRoute(
            makeRequest("/api/surveys", {
                method: "POST",
                headers: creatorHeaders,
                body: {
                    title: "Khảo sát vệ sinh môi trường",
                    eligibleAll: false,
                    eligibleRoles: ["house_owner"],
                    coEditorUserIds,
                    questions: [
                        {
                            question: "Bạn có hài lòng?",
                            type: "dong_y_khong_dong_y",
                            options: ["Đồng ý", "Không đồng ý"],
                            required: true,
                        },
                    ],
                },
            }),
        ),
    );
    return res.data._id as string;
}

async function recipientsOf(type: string): Promise<string[]> {
    const notifications = await Notification.find({ type }).select("_id");
    const deliveries = await NotificationDelivery.find({
        notificationId: { $in: notifications.map(n => n._id) },
    }).select("userId");
    return deliveries.map(d => String(d.userId)).sort();
}

describe("Khao sat - nguoi quan ly khong gioi han pham vi", () => {
    it("thay moi khao sat kem nguoi tao/doi tuong, nhung khong phai doi tuong tra loi", async () => {
        const creator = await createTestUser({ roles: ["secretary"] });
        const viewer = await createUnlimitedViewer();
        const surveyId = await createDraftSurvey(await authHeaders(creator), []);

        const list = await readJson(
            await listSurveysRoute(
                makeRequest("/api/surveys", { headers: await authHeaders(viewer) }),
            ),
        );
        expect(list.data.canViewAll).toBe(true);
        const item = list.data.items.find((s: { _id: string }) => s._id === surveyId);
        expect(item).toBeTruthy();
        expect(item.createdBy.displayName).toBe(creator.displayName);
        expect(item.eligibleRoleNames).toEqual(["house_owner"]);
        expect(item.isEligible).toBe(false);

        const overview = await readJson(
            await surveyOverviewRoute(
                makeRequest(`/api/surveys/${surveyId}/overview`, {
                    headers: await authHeaders(viewer),
                }),
                { params: { id: surveyId } },
            ),
        );
        expect(overview.data.canManageStatus).toBe(true);
        expect(overview.data.canEdit).toBe(false);
        expect(overview.data.isCreatorOrCoEditor).toBe(false);
    });

    it("mo/dong khao sat cua nguoi khac va bao cho nguoi tao + dong chu bien", async () => {
        const creator = await createTestUser({ roles: ["secretary"] });
        const coEditor = await createTestUser({ roles: ["secretary"] });
        const viewer = await createUnlimitedViewer();
        const surveyId = await createDraftSurvey(await authHeaders(creator), [
            String(coEditor._id),
        ]);
        const viewerHeaders = await authHeaders(viewer);

        const openRes = await openSurveyRoute(
            makeRequest(`/api/surveys/${surveyId}/open`, {
                method: "POST",
                headers: viewerHeaders,
            }),
            { params: { id: surveyId } },
        );
        expect(openRes.status).toBe(200);
        expect(await recipientsOf("survey.opened_by_other")).toEqual(
            [String(creator._id), String(coEditor._id)].sort(),
        );

        const closeRes = await closeSurveyRoute(
            makeRequest(`/api/surveys/${surveyId}/close`, {
                method: "POST",
                headers: viewerHeaders,
            }),
            { params: { id: surveyId } },
        );
        expect(closeRes.status).toBe(200);
        expect(await recipientsOf("survey.closed_by_other")).toEqual(
            [String(creator._id), String(coEditor._id)].sort(),
        );
    });

    it("nguoi tao tu mo khao sat cua minh thi khong gui thong bao 'bi nguoi khac mo'", async () => {
        const creator = await createTestUser({ roles: ["secretary"] });
        const creatorHeaders = await authHeaders(creator);
        const surveyId = await createDraftSurvey(creatorHeaders, []);

        const openRes = await openSurveyRoute(
            makeRequest(`/api/surveys/${surveyId}/open`, {
                method: "POST",
                headers: creatorHeaders,
            }),
            { params: { id: surveyId } },
        );
        expect(openRes.status).toBe(200);
        expect(await recipientsOf("survey.opened_by_other")).toEqual([]);
    });

    it("nguoi co quyen mo khao sat nhung bi gioi han pham vi van khong mo duoc khao sat cua nguoi khac", async () => {
        const creator = await createTestUser({ roles: ["secretary"] });
        const otherSecretary = await createTestUser({ roles: ["secretary"] });
        const surveyId = await createDraftSurvey(await authHeaders(creator), []);

        const openRes = await openSurveyRoute(
            makeRequest(`/api/surveys/${surveyId}/open`, {
                method: "POST",
                headers: await authHeaders(otherSecretary),
            }),
            { params: { id: surveyId } },
        );
        expect(openRes.status).toBe(403);
    });
});
