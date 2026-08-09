import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import {
    POST as createBusinessRoute,
    GET as listBusinessesRoute,
} from "@/app/api/businesses/route";
import {
    GET as getBusinessRoute,
    PATCH as updateBusinessRoute,
    DELETE as deleteBusinessRoute,
} from "@/app/api/businesses/[id]/route";
import { PATCH as transitionBusinessStatusRoute } from "@/app/api/businesses/[id]/status/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

/**
 * Kiem tra fix "chu nha (house_owner) duoc tu khai ho kinh doanh trong nha cua
 * minh" (Luong test E, 17.7 - truoc day house_owner khong co bat ky quyen
 * businesses.* nao) va fix "khong xoa cung ho kinh doanh da co lich su" (ma
 * tran quyen muc 13 - "Xoa lich su: Khong").
 */

async function createOwnedHouse(ownerHeaders: Record<string, string>, address: string) {
    const res = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers: ownerHeaders,
            body: { cluster: "Cụm kinh doanh", address },
        }),
    );
    return (await readJson(res)).data;
}

describe("Chu nha tu tao ho kinh doanh trong nha cua minh (businesses.create cho house_owner)", () => {
    it("chu nha tao/xem/sua duoc ho kinh doanh trong nha cua chinh minh", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Y01-L12, khu An Phú");

        const createRes = await createBusinessRoute(
            makeRequest("/api/businesses", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    name: "Công ty TNHH Minh An Demo",
                    houseId: house._id,
                    ownerName: "Lê Minh Cường",
                    phone: "0900000103",
                },
            }),
        );
        expect(createRes.status).toBe(201);
        const business = (await readJson(createRes)).data;
        expect(business.name).toBe("Công ty TNHH Minh An Demo");

        const getRes = await getBusinessRoute(
            makeRequest(`/api/businesses/${business._id}`, { headers: ownerHeaders }),
            { params: { id: business._id } },
        );
        expect(getRes.status).toBe(200);

        const updateRes = await updateBusinessRoute(
            makeRequest(`/api/businesses/${business._id}`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { note: "Nhà hàng/cafe - demo" },
            }),
            { params: { id: business._id } },
        );
        expect(updateRes.status).toBe(200);
        expect((await readJson(updateRes)).data.note).toBe("Nhà hàng/cafe - demo");

        const listRes = await listBusinessesRoute(
            makeRequest("/api/businesses", { headers: ownerHeaders }),
        );
        const listJson = await readJson(listRes);
        expect(listJson.data.items.map((b: any) => b._id)).toContain(business._id);
    });

    it("chu nha KHONG tao duoc ho kinh doanh trong nha cua chu nha khac", async () => {
        const ownerA = await createTestUser({ roles: ["house_owner"] });
        const ownerAHeaders = await authHeaders(ownerA);
        const houseA = await createOwnedHouse(ownerAHeaders, "Số 1, Cụm kinh doanh");

        const ownerB = await createTestUser({ roles: ["house_owner"] });
        const ownerBHeaders = await authHeaders(ownerB);

        const createRes = await createBusinessRoute(
            makeRequest("/api/businesses", {
                method: "POST",
                headers: ownerBHeaders,
                body: { name: "Cửa hàng của B tại nhà A", houseId: houseA._id },
            }),
        );
        expect(createRes.status).toBe(403);
    });

    it("chu nha KHONG co quyen xoa/duyet - businesses.delete va businesses.verify van bi tu choi", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Số 2, Cụm kinh doanh");

        const createRes = await createBusinessRoute(
            makeRequest("/api/businesses", {
                method: "POST",
                headers: ownerHeaders,
                body: { name: "Tiệm demo xóa", houseId: house._id },
            }),
        );
        const business = (await readJson(createRes)).data;

        const deleteRes = await deleteBusinessRoute(
            makeRequest(`/api/businesses/${business._id}`, {
                method: "DELETE",
                headers: ownerHeaders,
            }),
            { params: { id: business._id } },
        );
        expect(deleteRes.status).toBe(403);
    });
});

describe("Khong xoa cung ho kinh doanh da co lich su (businesses.delete)", () => {
    it("admin xoa duoc ho kinh doanh moi tao, chua co lich su gi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const house = await createOwnedHouse(adminHeaders, "Số 3, Cụm kinh doanh");

        const createRes = await createBusinessRoute(
            makeRequest("/api/businesses", {
                method: "POST",
                headers: adminHeaders,
                body: { name: "Tiệm tạo nhầm", houseId: house._id },
            }),
        );
        const business = (await readJson(createRes)).data;

        const deleteRes = await deleteBusinessRoute(
            makeRequest(`/api/businesses/${business._id}`, {
                method: "DELETE",
                headers: adminHeaders,
            }),
            { params: { id: business._id } },
        );
        expect(deleteRes.status).toBe(200);
    });

    it("admin KHONG xoa duoc ho kinh doanh da xac thuc - phai dung active=false", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const house = await createOwnedHouse(adminHeaders, "Số 4, Cụm kinh doanh");

        const createRes = await createBusinessRoute(
            makeRequest("/api/businesses", {
                method: "POST",
                headers: adminHeaders,
                body: { name: "Tiệm đã xác thực", houseId: house._id },
            }),
        );
        const business = (await readJson(createRes)).data;

        const verifyRes = await transitionBusinessStatusRoute(
            makeRequest(`/api/businesses/${business._id}/status`, {
                method: "PATCH",
                headers: adminHeaders,
                body: { status: "verified" },
            }),
            { params: { id: business._id } },
        );
        expect(verifyRes.status).toBe(200);

        const deleteRes = await deleteBusinessRoute(
            makeRequest(`/api/businesses/${business._id}`, {
                method: "DELETE",
                headers: adminHeaders,
            }),
            { params: { id: business._id } },
        );
        expect(deleteRes.status).toBe(409);

        // Thay vao do, dung active=false de "ngung hoat dong" ma khong mat lich su.
        const closeRes = await updateBusinessRoute(
            makeRequest(`/api/businesses/${business._id}`, {
                method: "PATCH",
                headers: adminHeaders,
                body: { active: false },
            }),
            { params: { id: business._id } },
        );
        expect(closeRes.status).toBe(200);
        const closed = (await readJson(closeRes)).data;
        expect(closed.active).toBe(false);
        expect(closed.status).toBe("verified");
    });
});
