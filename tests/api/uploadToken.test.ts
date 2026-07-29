import { describe, it, expect, afterEach } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { POST as createUploadTokenRoute } from "@/app/api/uploads/token/route";
import { POST as uploadAttachmentRoute } from "@/app/api/uploads/attachments/route";
import { GET as listHouseAttachmentsRoute } from "@/app/api/houses/[id]/attachments/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function setupOwnerWithHouse(clusterName: string) {
    const owner = await createTestUser({
        roles: ["house_owner"],
        permissions: ["houses.read", "houses.create", "houses.update"],
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
    return { owner, headers, house };
}

const uploadedFileUrls: string[] = [];

afterEach(async () => {
    const { deleteUploadedFile } = await import("@/lib/localUpload");
    await Promise.all(uploadedFileUrls.map(url => deleteUploadedFile(url)));
    uploadedFileUrls.length = 0;
});

describe("Cap token upload va tai file dinh kem (Zalo openMediaPicker flow)", () => {
    it("chu nha cap duoc token cho nha cua minh", async () => {
        const { house, headers } = await setupOwnerWithHouse("Cụm A");
        const res = await createUploadTokenRoute(
            makeRequest("/api/uploads/token", {
                method: "POST",
                headers,
                body: { relatedModel: "HouseRecord", relatedId: house._id },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(typeof json.data.token).toBe("string");
    });

    it("khong cap token cho nha khong phai cua minh", async () => {
        const a = await setupOwnerWithHouse("Cụm A");
        const b = await setupOwnerWithHouse("Cụm B");
        const res = await createUploadTokenRoute(
            makeRequest("/api/uploads/token", {
                method: "POST",
                headers: b.headers,
                body: { relatedModel: "HouseRecord", relatedId: a.house._id },
            }),
        );
        expect(res.status).toBe(403);
    });

    it("tai file thanh cong voi token hop le, tra ve dung khung {error:0,...} va tao FileAsset", async () => {
        const { house, headers } = await setupOwnerWithHouse("Cụm A");
        const tokenRes = await createUploadTokenRoute(
            makeRequest("/api/uploads/token", {
                method: "POST",
                headers,
                body: { relatedModel: "HouseRecord", relatedId: house._id },
            }),
        );
        const { token } = (await readJson(tokenRes)).data;

        const formData = new FormData();
        formData.append(
            "file",
            new File(["fake-image-bytes"], "evidence.jpg", {
                type: "image/jpeg",
            }),
        );
        const uploadReq = new Request(
            `http://localhost/api/uploads/attachments?token=${token}`,
            { method: "POST", body: formData },
        );
        const uploadRes = await uploadAttachmentRoute(uploadReq);
        const uploadJson = await uploadRes.json();

        expect(uploadJson.error).toBe(0);
        expect(uploadJson.data.urls).toHaveLength(1);
        uploadedFileUrls.push(new URL(uploadJson.data.urls[0]).pathname);

        const listRes = await listHouseAttachmentsRoute(
            makeRequest(`/api/houses/${house._id}/attachments`, {
                headers,
            }),
            { params: { id: house._id } },
        );
        const listJson = await readJson(listRes);
        expect(listJson.data).toHaveLength(1);
        expect(listJson.data[0].name).toBe("evidence.jpg");
    });

    it("tu choi tai len voi token khong hop le", async () => {
        const formData = new FormData();
        formData.append(
            "file",
            new File(["x"], "evidence.jpg", { type: "image/jpeg" }),
        );
        const uploadReq = new Request(
            "http://localhost/api/uploads/attachments?token=not-a-real-token",
            { method: "POST", body: formData },
        );
        const uploadRes = await uploadAttachmentRoute(uploadReq);
        const uploadJson = await uploadRes.json();
        expect(uploadJson.error).not.toBe(0);
    });

    it("tu choi dinh dang file khong duoc ho tro", async () => {
        const { house, headers } = await setupOwnerWithHouse("Cụm A");
        const tokenRes = await createUploadTokenRoute(
            makeRequest("/api/uploads/token", {
                method: "POST",
                headers,
                body: { relatedModel: "HouseRecord", relatedId: house._id },
            }),
        );
        const { token } = (await readJson(tokenRes)).data;

        const formData = new FormData();
        formData.append(
            "file",
            new File(["x"], "malware.exe", {
                type: "application/octet-stream",
            }),
        );
        const uploadReq = new Request(
            `http://localhost/api/uploads/attachments?token=${token}`,
            { method: "POST", body: formData },
        );
        const uploadRes = await uploadAttachmentRoute(uploadReq);
        const uploadJson = await uploadRes.json();
        expect(uploadJson.error).not.toBe(0);
    });
});
