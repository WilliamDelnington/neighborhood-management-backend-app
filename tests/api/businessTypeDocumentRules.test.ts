import { describe, it, expect } from "vitest";
import { POST as createDocumentTypeRoute } from "@/app/api/document-types/route";
import { POST as createBusinessTypeRoute } from "@/app/api/business-types/route";
import { PUT as putDocumentRulesRoute } from "@/app/api/business-types/[id]/document-rules/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function setup(headers: Record<string, string>) {
    const dtRes = await createDocumentTypeRoute(
        makeRequest("/api/document-types", {
            method: "POST",
            headers,
            body: { name: "Giấy phép PCCC", code: `PCCC-${Date.now()}-${Math.random()}` },
        }),
    );
    const documentType = (await readJson(dtRes)).data;

    const btRes = await createBusinessTypeRoute(
        makeRequest("/api/business-types", {
            method: "POST",
            headers,
            body: { name: `Quán ăn ${Date.now()}-${Math.random()}` },
        }),
    );
    const businessType = (await readJson(btRes)).data;

    return { documentType, businessType };
}

describe("Cau hinh dong luat giay to cho loai hinh kinh doanh (document-rules) - chi admin", () => {
    it("admin thay the duoc toan bo dong luat", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { documentType, businessType } = await setup(headers);

        const res = await putDocumentRulesRoute(
            makeRequest(
                `/api/business-types/${businessType._id}/document-rules`,
                {
                    method: "PUT",
                    headers,
                    body: {
                        requiredDocuments: [
                            {
                                documentTypeId: documentType._id,
                                isRequired: true,
                                reviewerRoles: ["regional_police"],
                            },
                        ],
                    },
                },
            ),
            { params: { id: businessType._id } },
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.requiredDocuments).toHaveLength(1);
        expect(json.data.requiredDocuments[0].reviewerRoles).toEqual([
            "regional_police",
        ]);
    });

    it("nhan vien khong co business_types.update bi tu choi (403)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const { businessType } = await setup(adminHeaders);

        const leader = await createTestUser({
            roles: ["neighborhood_leader"],
        });
        const leaderHeaders = await authHeaders(leader);

        const res = await putDocumentRulesRoute(
            makeRequest(
                `/api/business-types/${businessType._id}/document-rules`,
                {
                    method: "PUT",
                    headers: leaderHeaders,
                    body: { requiredDocuments: [] },
                },
            ),
            { params: { id: businessType._id } },
        );
        expect(res.status).toBe(403);
    });

    it("tu choi neu documentTypeId khong ton tai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { businessType } = await setup(headers);

        const res = await putDocumentRulesRoute(
            makeRequest(
                `/api/business-types/${businessType._id}/document-rules`,
                {
                    method: "PUT",
                    headers,
                    body: {
                        requiredDocuments: [
                            {
                                documentTypeId: "000000000000000000000000",
                                isRequired: true,
                            },
                        ],
                    },
                },
            ),
            { params: { id: businessType._id } },
        );
        expect(res.status).toBe(400);
    });

    it("cho phep xoa het dong luat (mang rong)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { documentType, businessType } = await setup(headers);

        await putDocumentRulesRoute(
            makeRequest(
                `/api/business-types/${businessType._id}/document-rules`,
                {
                    method: "PUT",
                    headers,
                    body: {
                        requiredDocuments: [
                            { documentTypeId: documentType._id, isRequired: true },
                        ],
                    },
                },
            ),
            { params: { id: businessType._id } },
        );

        const res = await putDocumentRulesRoute(
            makeRequest(
                `/api/business-types/${businessType._id}/document-rules`,
                {
                    method: "PUT",
                    headers,
                    body: { requiredDocuments: [] },
                },
            ),
            { params: { id: businessType._id } },
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.requiredDocuments).toHaveLength(0);
    });
});
