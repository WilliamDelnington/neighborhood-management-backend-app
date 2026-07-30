import { describe, it, expect, afterEach } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { POST as createBusinessRoute } from "@/app/api/businesses/route";
import { POST as createDocumentTypeRoute } from "@/app/api/document-types/route";
import { POST as createBusinessTypeRoute } from "@/app/api/business-types/route";
import { PUT as putDocumentRulesRoute } from "@/app/api/business-types/[id]/document-rules/route";
import { POST as createUploadTokenRoute } from "@/app/api/uploads/token/route";
import { POST as uploadAttachmentRoute } from "@/app/api/uploads/attachments/route";
import { POST as createBusinessDocumentRoute } from "@/app/api/businesses/[id]/documents/route";
import { PUT as reviewBusinessDocumentRoute } from "@/app/api/businesses/[id]/documents/[documentId]/review/route";
import { GET as requiredDocumentsRoute } from "@/app/api/businesses/[id]/required-documents/route";
import { DELETE as deleteBusinessTypeRoute } from "@/app/api/business-types/[id]/route";
import { DELETE as deleteDocumentTypeRoute } from "@/app/api/document-types/[id]/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

const uploadedFileUrls: string[] = [];
afterEach(async () => {
    const { deleteUploadedFile } = await import("@/lib/localUpload");
    await Promise.all(uploadedFileUrls.map(url => deleteUploadedFile(url)));
    uploadedFileUrls.length = 0;
});

async function setupBusinessTypeWithRule(
    adminHeaders: Record<string, string>,
    reviewerRoles: string[],
) {
    const dtRes = await createDocumentTypeRoute(
        makeRequest("/api/document-types", {
            method: "POST",
            headers: adminHeaders,
            body: {
                name: "Giấy chứng nhận đăng ký kinh doanh",
                code: `BRC-${Date.now()}-${Math.random()}`,
            },
        }),
    );
    const documentType = (await readJson(dtRes)).data;

    const btRes = await createBusinessTypeRoute(
        makeRequest("/api/business-types", {
            method: "POST",
            headers: adminHeaders,
            body: { name: `Nhà hàng ${Date.now()}-${Math.random()}` },
        }),
    );
    const businessType = (await readJson(btRes)).data;

    const rulesRes = await putDocumentRulesRoute(
        makeRequest(`/api/business-types/${businessType._id}/document-rules`, {
            method: "PUT",
            headers: adminHeaders,
            body: {
                requiredDocuments: [
                    {
                        documentTypeId: documentType._id,
                        isRequired: true,
                        reviewerRoles,
                    },
                ],
            },
        }),
        { params: { id: businessType._id } },
    );
    expect(rulesRes.status).toBe(200);

    return { documentType, businessType };
}

async function setupOwnerWithBusiness(
    clusterName: string,
    businessTypeId: string,
) {
    const owner = await createTestUser({
        roles: ["house_owner"],
        permissions: [
            "houses.read",
            "houses.create",
            "houses.update",
            "businesses.read",
            "businesses.create",
        ],
    });
    const headers = await authHeaders(owner);

    const houseRes = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers,
            body: { cluster: clusterName, address: `Số 1, ${clusterName}` },
        }),
    );
    const house = (await readJson(houseRes)).data;

    const businessRes = await createBusinessRoute(
        makeRequest("/api/businesses", {
            method: "POST",
            headers,
            body: {
                name: `Nhà hàng tại ${clusterName}`,
                houseId: house._id,
                businessType: businessTypeId,
            },
        }),
    );
    const business = (await readJson(businessRes)).data;

    return { owner, headers, house, business };
}

async function uploadBusinessDocumentFile(
    businessId: string,
    headers: Record<string, string>,
) {
    const tokenRes = await createUploadTokenRoute(
        makeRequest("/api/uploads/token", {
            method: "POST",
            headers,
            body: { relatedModel: "BusinessDocument", relatedId: businessId },
        }),
    );
    const tokenJson = await readJson(tokenRes);
    expect(tokenRes.status).toBe(200);
    const { token } = tokenJson.data;

    const formData = new FormData();
    formData.append(
        "file",
        new File(["fake-pdf-bytes"], "giay-phep.pdf", {
            type: "application/pdf",
        }),
    );
    const uploadReq = new Request(
        `http://localhost/api/uploads/attachments?token=${token}`,
        { method: "POST", body: formData },
    );
    const uploadRes = await uploadAttachmentRoute(uploadReq);
    const uploadJson = await uploadRes.json();
    expect(uploadJson.error).toBe(0);
    uploadedFileUrls.push(new URL(uploadJson.data.urls[0]).pathname);
    return uploadJson.data.fileAssetIds[0] as string;
}

describe("Xac thuc ho kinh doanh theo tung giay to (business document verification)", () => {
    it("chu ho nop giay to bat buoc -> business chuyen unverified -> pending_approval", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const { documentType, businessType } = await setupBusinessTypeWithRule(
            adminHeaders,
            ["regional_police"],
        );
        const { owner, headers, business } = await setupOwnerWithBusiness(
            "Cụm A",
            businessType._id,
        );
        expect(business.status).toBe("unverified");

        const fileAssetId = await uploadBusinessDocumentFile(
            business._id,
            headers,
        );
        const docRes = await createBusinessDocumentRoute(
            makeRequest(`/api/businesses/${business._id}/documents`, {
                method: "POST",
                headers,
                body: { documentTypeId: documentType._id, fileAssetId },
            }),
            { params: { id: business._id } },
        );
        const docJson = await readJson(docRes);
        expect(docRes.status).toBe(201);
        expect(docJson.data.status).toBe("pending");

        const reqRes = await requiredDocumentsRoute(
            makeRequest(`/api/businesses/${business._id}/required-documents`, {
                headers,
            }),
            { params: { id: business._id } },
        );
        const reqJson = await readJson(reqRes);
        expect(reqJson.data.business.status).toBe("pending_approval");
        expect(reqJson.data.items).toHaveLength(1);
        expect(reqJson.data.items[0].missing).toBe(false);
    });

    it("nguoi khong dung vai tro phu trach bi tu choi khi duyet (403)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const { documentType, businessType } = await setupBusinessTypeWithRule(
            adminHeaders,
            ["regional_police"],
        );
        const { headers, business } = await setupOwnerWithBusiness(
            "Cụm A",
            businessType._id,
        );
        const fileAssetId = await uploadBusinessDocumentFile(
            business._id,
            headers,
        );
        const docRes = await createBusinessDocumentRoute(
            makeRequest(`/api/businesses/${business._id}/documents`, {
                method: "POST",
                headers,
                body: { documentTypeId: documentType._id, fileAssetId },
            }),
            { params: { id: business._id } },
        );
        const businessDocument = (await readJson(docRes)).data;

        const leader = await createTestUser({
            roles: ["neighborhood_leader"],
            permissions: ["businesses.verify"],
        });
        const leaderHeaders = await authHeaders(leader);

        const reviewRes = await reviewBusinessDocumentRoute(
            makeRequest(
                `/api/businesses/${business._id}/documents/${businessDocument._id}/review`,
                {
                    method: "PUT",
                    headers: leaderHeaders,
                    body: { decision: "approved" },
                },
            ),
            { params: { id: business._id, documentId: businessDocument._id } },
        );
        expect(reviewRes.status).toBe(403);
    });

    it("dung vai tro phu trach duyet duoc -> business chuyen verified khi da du giay to bat buoc", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const { documentType, businessType } = await setupBusinessTypeWithRule(
            adminHeaders,
            ["regional_police"],
        );
        const { headers, business } = await setupOwnerWithBusiness(
            "Cụm A",
            businessType._id,
        );
        const fileAssetId = await uploadBusinessDocumentFile(
            business._id,
            headers,
        );
        const docRes = await createBusinessDocumentRoute(
            makeRequest(`/api/businesses/${business._id}/documents`, {
                method: "POST",
                headers,
                body: { documentTypeId: documentType._id, fileAssetId },
            }),
            { params: { id: business._id } },
        );
        const businessDocument = (await readJson(docRes)).data;

        const police = await createTestUser({ roles: ["regional_police"] });
        const policeHeaders = await authHeaders(police);

        const reviewRes = await reviewBusinessDocumentRoute(
            makeRequest(
                `/api/businesses/${business._id}/documents/${businessDocument._id}/review`,
                {
                    method: "PUT",
                    headers: policeHeaders,
                    body: { decision: "approved" },
                },
            ),
            { params: { id: business._id, documentId: businessDocument._id } },
        );
        const reviewJson = await readJson(reviewRes);
        expect(reviewRes.status).toBe(200);
        expect(reviewJson.data.status).toBe("approved");

        const reqRes = await requiredDocumentsRoute(
            makeRequest(`/api/businesses/${business._id}/required-documents`, {
                headers,
            }),
            { params: { id: business._id } },
        );
        const reqJson = await readJson(reqRes);
        expect(reqJson.data.business.status).toBe("verified");
    });

    it("tu choi giay to -> business chuyen need_supplement va bao ly do", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const { documentType, businessType } = await setupBusinessTypeWithRule(
            adminHeaders,
            ["regional_police"],
        );
        const { headers, business } = await setupOwnerWithBusiness(
            "Cụm A",
            businessType._id,
        );
        const fileAssetId = await uploadBusinessDocumentFile(
            business._id,
            headers,
        );
        const docRes = await createBusinessDocumentRoute(
            makeRequest(`/api/businesses/${business._id}/documents`, {
                method: "POST",
                headers,
                body: { documentTypeId: documentType._id, fileAssetId },
            }),
            { params: { id: business._id } },
        );
        const businessDocument = (await readJson(docRes)).data;

        const police = await createTestUser({ roles: ["regional_police"] });
        const policeHeaders = await authHeaders(police);

        const reviewRes = await reviewBusinessDocumentRoute(
            makeRequest(
                `/api/businesses/${business._id}/documents/${businessDocument._id}/review`,
                {
                    method: "PUT",
                    headers: policeHeaders,
                    body: {
                        decision: "rejected",
                        rejectionReason: "Ảnh mờ, không đọc được số giấy phép",
                    },
                },
            ),
            { params: { id: business._id, documentId: businessDocument._id } },
        );
        const reviewJson = await readJson(reviewRes);
        expect(reviewRes.status).toBe(200);
        expect(reviewJson.data.status).toBe("rejected");

        const reqRes = await requiredDocumentsRoute(
            makeRequest(`/api/businesses/${business._id}/required-documents`, {
                headers,
            }),
            { params: { id: business._id } },
        );
        const reqJson = await readJson(reqRes);
        expect(reqJson.data.business.status).toBe("need_supplement");
    });

    it("nguoi khong phai chu ho khong duoc nop giay to cho ho kinh doanh cua nguoi khac", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const { documentType, businessType } = await setupBusinessTypeWithRule(
            adminHeaders,
            ["regional_police"],
        );
        const { business } = await setupOwnerWithBusiness(
            "Cụm A",
            businessType._id,
        );

        const otherOwner = await createTestUser({
            roles: ["house_owner"],
            permissions: ["businesses.read"],
        });
        const otherHeaders = await authHeaders(otherOwner);

        const docRes = await createBusinessDocumentRoute(
            makeRequest(`/api/businesses/${business._id}/documents`, {
                method: "POST",
                headers: otherHeaders,
                body: {
                    documentTypeId: documentType._id,
                    fileAssetId: "000000000000000000000000",
                },
            }),
            { params: { id: business._id } },
        );
        expect(docRes.status).toBe(403);
    });

    it("khong xoa duoc loai hinh kinh doanh dang duoc ho kinh doanh su dung", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const { businessType } = await setupBusinessTypeWithRule(adminHeaders, [
            "regional_police",
        ]);
        await setupOwnerWithBusiness("Cụm A", businessType._id);

        const deleteRes = await deleteBusinessTypeRoute(
            makeRequest(`/api/business-types/${businessType._id}`, {
                method: "DELETE",
                headers: adminHeaders,
            }),
            { params: { id: businessType._id } },
        );
        expect(deleteRes.status).toBe(409);
    });

    it("khong xoa duoc loai giay to da co ho kinh doanh nop", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const { documentType, businessType } = await setupBusinessTypeWithRule(
            adminHeaders,
            ["regional_police"],
        );
        const { headers, business } = await setupOwnerWithBusiness(
            "Cụm A",
            businessType._id,
        );
        const fileAssetId = await uploadBusinessDocumentFile(
            business._id,
            headers,
        );
        await createBusinessDocumentRoute(
            makeRequest(`/api/businesses/${business._id}/documents`, {
                method: "POST",
                headers,
                body: { documentTypeId: documentType._id, fileAssetId },
            }),
            { params: { id: business._id } },
        );

        const deleteRes = await deleteDocumentTypeRoute(
            makeRequest(`/api/document-types/${documentType._id}`, {
                method: "DELETE",
                headers: adminHeaders,
            }),
            { params: { id: documentType._id } },
        );
        expect(deleteRes.status).toBe(409);
    });
});
