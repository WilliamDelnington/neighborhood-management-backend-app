import { describe, it, expect } from "vitest";
import { POST as createSurveyRoute } from "@/app/api/surveys/route";
import { POST as openSurveyRoute } from "@/app/api/surveys/[id]/open/route";
import { POST as respondSurveyRoute } from "@/app/api/surveys/[id]/respond/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createOpenSurvey(adminHeaders: Record<string, string>) {
    const createRes = await readJson(
        await createSurveyRoute(
            makeRequest("/api/surveys", {
                method: "POST",
                headers: adminHeaders,
                body: {
                    title: "Khảo sát mức độ hài lòng về an ninh trật tự",
                    questions: [
                        {
                            question:
                                "Bạn có hài lòng với an ninh khu vực hiện tại?",
                            type: "dong_y_khong_dong_y",
                            options: ["Đồng ý", "Không đồng ý"],
                            required: true,
                        },
                    ],
                },
            }),
        ),
    );
    const surveyId = createRes.data._id;
    await openSurveyRoute(
        makeRequest(`/api/surveys/${surveyId}/open`, {
            method: "POST",
            headers: adminHeaders,
        }),
        { params: { id: surveyId } },
    );
    return { surveyId, questionId: createRes.data.questions[0]._id };
}

describe("Ngan chan tra loi khao sat trung lap", () => {
    it("cho phep tra loi lan dau va tu choi lan tra loi thu hai cua cung mot nguoi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const houseOwner = await createTestUser({ roles: ["house_owner"] });
        const { surveyId, questionId } = await createOpenSurvey(
            await authHeaders(admin),
        );
        const houseOwnerHeaders = await authHeaders(houseOwner);

        const firstRes = await respondSurveyRoute(
            makeRequest(`/api/surveys/${surveyId}/respond`, {
                method: "POST",
                headers: houseOwnerHeaders,
                body: {
                    answers: [{ questionId, selectedOptions: ["Đồng ý"] }],
                },
            }),
            { params: { id: surveyId } },
        );
        expect(firstRes.status).toBe(201);

        const secondRes = await respondSurveyRoute(
            makeRequest(`/api/surveys/${surveyId}/respond`, {
                method: "POST",
                headers: houseOwnerHeaders,
                body: {
                    answers: [
                        { questionId, selectedOptions: ["Không đồng ý"] },
                    ],
                },
            }),
            { params: { id: surveyId } },
        );
        expect(secondRes.status).toBe(409);
    });

    it("hai nguoi khac nhau van co the tra loi cung mot khao sat", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const houseOwnerA = await createTestUser({ roles: ["house_owner"] });
        const houseOwnerB = await createTestUser({ roles: ["house_owner"] });
        const { surveyId, questionId } = await createOpenSurvey(
            await authHeaders(admin),
        );

        const resA = await respondSurveyRoute(
            makeRequest(`/api/surveys/${surveyId}/respond`, {
                method: "POST",
                headers: await authHeaders(houseOwnerA),
                body: {
                    answers: [{ questionId, selectedOptions: ["Đồng ý"] }],
                },
            }),
            { params: { id: surveyId } },
        );
        const resB = await respondSurveyRoute(
            makeRequest(`/api/surveys/${surveyId}/respond`, {
                method: "POST",
                headers: await authHeaders(houseOwnerB),
                body: {
                    answers: [{ questionId, selectedOptions: ["Đồng ý"] }],
                },
            }),
            { params: { id: surveyId } },
        );
        expect(resA.status).toBe(201);
        expect(resB.status).toBe(201);
    });
});
