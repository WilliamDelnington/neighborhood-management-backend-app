import { describe, it, expect } from "vitest";
import { GET as listDocumentTypesRoute, POST as createDocumentTypeRoute } from "@/app/api/document-types/route";
import {
    DELETE as deleteDocumentTypeRoute,
    PATCH as updateDocumentTypeRoute,
} from "@/app/api/document-types/[id]/route";
import { POST as createBusinessTypeRoute } from "@/app/api/business-types/route";
import { PUT as putDocumentRulesRoute } from "@/app/api/business-types/[id]/document-rules/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createDocType(headers: Record<string, string>, code: string) {
    const res = await createDocumentTypeRoute(
        makeRequest("/api/document-types", {
            method: "POST",
            headers,
            body: { name: "Giấy chứng nhận đăng ký kinh doanh", code },
        }),
    );
    return { res, json: await readJson(res) };
}

describe("Quan ly danh muc giay to (document types) - chi admin", () => {
    it("admin tao va liet ke duoc loai giay to", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);

        const { res, json } = await createDocType(headers, `CODE-${Date.now()}`);
        expect(res.status).toBe(201);
        expect(json.data.name).toBe("Giấy chứng nhận đăng ký kinh doanh");

        const listRes = await listDocumentTypesRoute(
            makeRequest("/api/document-types", { headers }),
        );
        const listJson = await readJson(listRes);
        expect(listJson.data.items.length).toBeGreaterThan(0);
    });

    it("nhan vien khong co quyen document_types.create bi tu choi (403)", async () => {
        const leader = await createTestUser({
            roles: ["neighborhood_leader"],
        });
        const headers = await authHeaders(leader);
        const { res } = await createDocType(headers, `CODE-${Date.now()}`);
        expect(res.status).toBe(403);
    });

    it("khong duoc tao trung ma code", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const code = `DUP-${Date.now()}`;
        await createDocType(headers, code);
        const { res } = await createDocType(headers, code);
        expect(res.status).toBe(409);
    });

    it("cap nhat duoc ten/trang thai active", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { json } = await createDocType(headers, `UPD-${Date.now()}`);

        const updateRes = await updateDocumentTypeRoute(
            makeRequest(`/api/document-types/${json.data._id}`, {
                method: "PATCH",
                headers,
                body: { active: false },
            }),
            { params: { id: json.data._id } },
        );
        const updateJson = await readJson(updateRes);
        expect(updateRes.status).toBe(200);
        expect(updateJson.data.active).toBe(false);
    });

    it("khong xoa duoc neu dang duoc mot loai hinh kinh doanh tham chieu", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { json: documentType } = await createDocType(
            headers,
            `REF-${Date.now()}`,
        );

        const btRes = await createBusinessTypeRoute(
            makeRequest("/api/business-types", {
                method: "POST",
                headers,
                body: { name: `Loại hình ${Date.now()}` },
            }),
        );
        const businessType = (await readJson(btRes)).data;

        await putDocumentRulesRoute(
            makeRequest(
                `/api/business-types/${businessType._id}/document-rules`,
                {
                    method: "PUT",
                    headers,
                    body: {
                        requiredDocuments: [
                            {
                                documentTypeId: documentType.data._id,
                                isRequired: true,
                            },
                        ],
                    },
                },
            ),
            { params: { id: businessType._id } },
        );

        const deleteRes = await deleteDocumentTypeRoute(
            makeRequest(`/api/document-types/${documentType.data._id}`, {
                method: "DELETE",
                headers,
            }),
            { params: { id: documentType.data._id } },
        );
        expect(deleteRes.status).toBe(409);
    });
});
