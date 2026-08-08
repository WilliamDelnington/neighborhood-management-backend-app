import { describe, it, expect, afterEach } from "vitest";
import { POST as createDraftRoute } from "@/app/api/complaints/draft/route";
import { POST as createUploadTokenRoute } from "@/app/api/uploads/token/route";
import { POST as uploadAttachmentRoute } from "@/app/api/uploads/attachments/route";
import { POST as createComplaintRoute } from "@/app/api/complaints/route";
import { GET as listComplaintAttachmentsRoute } from "@/app/api/complaints/[id]/attachments/route";
import { DELETE as deleteComplaintAttachmentRoute } from "@/app/api/complaints/[id]/attachments/[fileId]/route";
import { FileAsset } from "@/models";
import { cleanupExpiredComplaintDrafts } from "@/services/maintenanceService";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

const uploadedFileUrls: string[] = [];

afterEach(async () => {
    const { deleteUploadedFile } = await import("@/lib/localUpload");
    await Promise.all(uploadedFileUrls.map(url => deleteUploadedFile(url)));
    uploadedFileUrls.length = 0;
});

async function mintDraftId(headers: Record<string, string>): Promise<string> {
    const res = await createDraftRoute(
        makeRequest("/api/complaints/draft", { method: "POST", headers }),
    );
    const json = await readJson(res);
    expect(res.status).toBe(200);
    return json.data.draftId;
}

async function uploadComplaintAttachment(
    headers: Record<string, string>,
    relatedId: string,
    fileName = "evidence.jpg",
) {
    const tokenRes = await createUploadTokenRoute(
        makeRequest("/api/uploads/token", {
            method: "POST",
            headers,
            body: { relatedModel: "Complaint", relatedId },
        }),
    );
    expect(tokenRes.status).toBe(200);
    const { token } = (await readJson(tokenRes)).data;

    const formData = new FormData();
    formData.append(
        "file",
        new File(["fake-image-bytes"], fileName, { type: "image/jpeg" }),
    );
    const uploadRes = await uploadAttachmentRoute(
        new Request(`http://localhost/api/uploads/attachments?token=${token}`, {
            method: "POST",
            body: formData,
        }),
    );
    const uploadJson = await uploadRes.json();
    expect(uploadJson.error).toBe(0);
    uploadedFileUrls.push(new URL(uploadJson.data.urls[0]).pathname);
    return uploadJson.data.fileAssetIds[0] as string;
}

describe("Dinh kem tai lieu cho phan anh (draft-scoped upload)", () => {
    it("chu phan anh xin duoc token upload cho mot draftId chua ung voi phan anh nao", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const headers = await authHeaders(owner);
        const draftId = await mintDraftId(headers);

        const tokenRes = await createUploadTokenRoute(
            makeRequest("/api/uploads/token", {
                method: "POST",
                headers,
                body: { relatedModel: "Complaint", relatedId: draftId },
            }),
        );
        expect(tokenRes.status).toBe(200);
    });

    it("dinh kem file vao draftId roi tao phan anh voi draftId do -> file tu dong thuoc ve phan anh moi, khong can buoc gan lai", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const headers = await authHeaders(owner);
        const draftId = await mintDraftId(headers);

        await uploadComplaintAttachment(headers, draftId);

        const createRes = await createComplaintRoute(
            makeRequest("/api/complaints", {
                method: "POST",
                headers,
                body: {
                    category: "ve_sinh_moi_truong",
                    title: "Rác thải tồn đọng ở ngõ 12",
                    content: "Rác không được thu gom nhiều ngày nay.",
                    draftId,
                },
            }),
        );
        const created = await readJson(createRes);
        expect(createRes.status).toBe(201);
        expect(created.data._id).toBe(draftId);

        const listRes = await listComplaintAttachmentsRoute(
            makeRequest(`/api/complaints/${draftId}/attachments`, { headers }),
            { params: { id: draftId } },
        );
        const listJson = await readJson(listRes);
        expect(listJson.data).toHaveLength(1);
        expect(listJson.data[0].name).toBe("evidence.jpg");
    });

    it("nguoi khac khong xin duoc token de dinh kem vao phan anh da ton tai, khong phai cua minh", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const stranger = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);

        const draftId = await mintDraftId(ownerHeaders);
        const created = await readJson(
            await createComplaintRoute(
                makeRequest("/api/complaints", {
                    method: "POST",
                    headers: ownerHeaders,
                    body: {
                        category: "khac",
                        title: "Tieu de hop le cho phan anh nay",
                        content: "Noi dung du dai de qua kiem tra validator.",
                        draftId,
                    },
                }),
            ),
        );

        const res = await createUploadTokenRoute(
            makeRequest("/api/uploads/token", {
                method: "POST",
                headers: await authHeaders(stranger),
                body: { relatedModel: "Complaint", relatedId: created.data._id },
            }),
        );
        expect(res.status).toBe(403);
    });

    it("chi chu phan anh moi duoc xoa tai lieu dinh kem cua phan anh da ton tai", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const stranger = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);

        const draftId = await mintDraftId(ownerHeaders);
        const fileAssetId = await uploadComplaintAttachment(ownerHeaders, draftId);
        const created = await readJson(
            await createComplaintRoute(
                makeRequest("/api/complaints", {
                    method: "POST",
                    headers: ownerHeaders,
                    body: {
                        category: "khac",
                        title: "Tieu de hop le cho phan anh nay",
                        content: "Noi dung du dai de qua kiem tra validator.",
                        draftId,
                    },
                }),
            ),
        );

        const strangerDelete = await deleteComplaintAttachmentRoute(
            makeRequest(
                `/api/complaints/${created.data._id}/attachments/${fileAssetId}`,
                { method: "DELETE", headers: await authHeaders(stranger) },
            ),
            { params: { id: created.data._id, fileId: fileAssetId } },
        );
        expect(strangerDelete.status).toBe(403);

        const ownerDelete = await deleteComplaintAttachmentRoute(
            makeRequest(
                `/api/complaints/${created.data._id}/attachments/${fileAssetId}`,
                { method: "DELETE", headers: ownerHeaders },
            ),
            { params: { id: created.data._id, fileId: fileAssetId } },
        );
        expect(ownerDelete.status).toBe(200);
    });

    it("xoa duoc tai lieu dinh kem con trong giai doan draft (truoc khi phan anh duoc tao) - chi nguoi da tai len moi duoc xoa", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const stranger = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);

        const draftId = await mintDraftId(ownerHeaders);
        const fileAssetId = await uploadComplaintAttachment(ownerHeaders, draftId);

        const strangerDelete = await deleteComplaintAttachmentRoute(
            makeRequest(`/api/complaints/${draftId}/attachments/${fileAssetId}`, {
                method: "DELETE",
                headers: await authHeaders(stranger),
            }),
            { params: { id: draftId, fileId: fileAssetId } },
        );
        expect(strangerDelete.status).toBe(403);

        const ownerDelete = await deleteComplaintAttachmentRoute(
            makeRequest(`/api/complaints/${draftId}/attachments/${fileAssetId}`, {
                method: "DELETE",
                headers: ownerHeaders,
            }),
            { params: { id: draftId, fileId: fileAssetId } },
        );
        expect(ownerDelete.status).toBe(200);
    });

    it("can bo (staff) xem duoc danh sach tai lieu dinh kem cua phan anh nguoi khac nhung khong duoc xoa", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const staff = await createTestUser({ roles: ["regional_police"] });
        const ownerHeaders = await authHeaders(owner);

        const draftId = await mintDraftId(ownerHeaders);
        const fileAssetId = await uploadComplaintAttachment(ownerHeaders, draftId);
        const created = await readJson(
            await createComplaintRoute(
                makeRequest("/api/complaints", {
                    method: "POST",
                    headers: ownerHeaders,
                    body: {
                        category: "khac",
                        title: "Tieu de hop le cho phan anh nay",
                        content: "Noi dung du dai de qua kiem tra validator.",
                        draftId,
                    },
                }),
            ),
        );

        const staffHeaders = await authHeaders(staff);
        const listRes = await listComplaintAttachmentsRoute(
            makeRequest(`/api/complaints/${created.data._id}/attachments`, {
                headers: staffHeaders,
            }),
            { params: { id: created.data._id } },
        );
        expect(listRes.status).toBe(200);

        const deleteRes = await deleteComplaintAttachmentRoute(
            makeRequest(
                `/api/complaints/${created.data._id}/attachments/${fileAssetId}`,
                { method: "DELETE", headers: staffHeaders },
            ),
            { params: { id: created.data._id, fileId: fileAssetId } },
        );
        expect(deleteRes.status).toBe(403);
    });

    it("cleanupExpiredComplaintDrafts xoa file mo coi qua han nhung giu lai file cua phan anh da ton tai", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);

        const orphanDraftId = await mintDraftId(ownerHeaders);
        const orphanFileId = await uploadComplaintAttachment(
            ownerHeaders,
            orphanDraftId,
            "orphan.jpg",
        );

        const realDraftId = await mintDraftId(ownerHeaders);
        const realFileId = await uploadComplaintAttachment(
            ownerHeaders,
            realDraftId,
            "real.jpg",
        );
        const created = await readJson(
            await createComplaintRoute(
                makeRequest("/api/complaints", {
                    method: "POST",
                    headers: ownerHeaders,
                    body: {
                        category: "khac",
                        title: "Tieu de hop le cho phan anh nay",
                        content: "Noi dung du dai de qua kiem tra validator.",
                        draftId: realDraftId,
                    },
                }),
            ),
        );
        expect(created.data._id).toBe(realDraftId);

        const oldEnough = new Date(Date.now() - 25 * 60 * 60 * 1000);
        await FileAsset.collection.updateOne(
            { _id: (await FileAsset.findById(orphanFileId))!._id },
            { $set: { createdAt: oldEnough } },
        );
        await FileAsset.collection.updateOne(
            { _id: (await FileAsset.findById(realFileId))!._id },
            { $set: { createdAt: oldEnough } },
        );

        const deletedCount = await cleanupExpiredComplaintDrafts();
        expect(deletedCount).toBe(1);
        expect(await FileAsset.findById(orphanFileId)).toBeNull();
        expect(await FileAsset.findById(realFileId)).not.toBeNull();
    });
});
