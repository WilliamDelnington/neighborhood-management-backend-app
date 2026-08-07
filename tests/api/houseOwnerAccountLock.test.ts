import { describe, it, expect } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { PATCH as lockUserRoute } from "@/app/api/users/[id]/lock/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

/**
 * Kiem tra fix "neighborhood_leader duoc khoa/mo tai khoan chu nha trong pham
 * vi to dan pho minh phu trach" (Luong test F, 17.8) - truoc day khong role
 * nao ngoai admin lam duoc viec nay (users.update chi cap cho admin).
 */

async function createNeighborhood(
    adminHeaders: Record<string, string>,
    code: string,
    sequence: number,
) {
    const res = await createNeighborhoodRoute(
        makeRequest("/api/neighborhoods", {
            method: "POST",
            headers: adminHeaders,
            body: { name: `Tổ dân phố ${code}`, code, sequence },
        }),
    );
    return (await readJson(res)).data;
}

async function createOwnedHouse(
    ownerHeaders: Record<string, string>,
    neighborhoodId: string,
    address: string,
) {
    const res = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers: ownerHeaders,
            body: { cluster: "Cụm chung", address, neighborhoodId },
        }),
    );
    return (await readJson(res)).data;
}

describe("Khoa/mo tai khoan chu nha theo pham vi to dan pho (users.lock)", () => {
    it("to truong khoa duoc tai khoan chu nha co nha trong to dan pho minh phu trach, voi ly do", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "LOCK-A1", 201);

        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        await createOwnedHouse(ownerHeaders, neighborhoodA._id, "Số 10, Cụm chung");

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);

        const lockRes = await lockUserRoute(
            makeRequest(`/api/users/${owner._id}/lock`, {
                method: "PATCH",
                headers: leaderAHeaders,
                body: { status: "locked", statusReason: "Vi phạm quy định tổ dân phố" },
            }),
            { params: { id: String(owner._id) } },
        );
        expect(lockRes.status).toBe(200);
        const locked = (await readJson(lockRes)).data;
        expect(locked.status).toBe("locked");

        // Tai khoan bi khoa khong con goi duoc API nua (session cu bi vo hieu qua sessionVersion).
        const meRes = await meRoute(
            makeRequest("/api/auth/me", { headers: ownerHeaders }),
        );
        expect(meRes.status).toBe(401);
    });

    it("to truong KHONG khoa duoc tai khoan chu nha co nha o to dan pho khac", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "LOCK-A2", 202);
        const neighborhoodB = await createNeighborhood(adminHeaders, "LOCK-B2", 203);

        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        await createOwnedHouse(ownerHeaders, neighborhoodB._id, "Số 11, Cụm chung");

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);

        const lockRes = await lockUserRoute(
            makeRequest(`/api/users/${owner._id}/lock`, {
                method: "PATCH",
                headers: leaderAHeaders,
                body: { status: "locked", statusReason: "Thử khóa ngoài phạm vi" },
            }),
            { params: { id: String(owner._id) } },
        );
        expect(lockRes.status).toBe(403);
    });

    it("bat buoc nhap ly do khi khoa/mo tai khoan - thieu ly do bi tu choi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "LOCK-A3", 204);

        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        await createOwnedHouse(ownerHeaders, neighborhoodA._id, "Số 12, Cụm chung");

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);

        const lockRes = await lockUserRoute(
            makeRequest(`/api/users/${owner._id}/lock`, {
                method: "PATCH",
                headers: leaderAHeaders,
                body: { status: "locked", statusReason: "" },
            }),
            { params: { id: String(owner._id) } },
        );
        expect(lockRes.status).toBe(422);
    });

    it("to truong khong duoc khoa tai khoan khong phai chu nha (vd nhan vien khac)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "LOCK-A4", 205);

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);
        const secretary = await createTestUser({ roles: ["secretary"] });

        const lockRes = await lockUserRoute(
            makeRequest(`/api/users/${secretary._id}/lock`, {
                method: "PATCH",
                headers: leaderAHeaders,
                body: { status: "locked", statusReason: "Thử khóa nhầm vai trò" },
            }),
            { params: { id: String(secretary._id) } },
        );
        expect(lockRes.status).toBe(403);
    });

    it("admin khoa/mo duoc bat ky tai khoan chu nha nao, khong gioi han pham vi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const owner = await createTestUser({ roles: ["house_owner"] });

        const lockRes = await lockUserRoute(
            makeRequest(`/api/users/${owner._id}/lock`, {
                method: "PATCH",
                headers: adminHeaders,
                body: { status: "locked", statusReason: "Admin khóa để kiểm tra" },
            }),
            { params: { id: String(owner._id) } },
        );
        expect(lockRes.status).toBe(200);

        const unlockRes = await lockUserRoute(
            makeRequest(`/api/users/${owner._id}/lock`, {
                method: "PATCH",
                headers: adminHeaders,
                body: { status: "active", statusReason: "Đã xác minh xong, mở lại" },
            }),
            { params: { id: String(owner._id) } },
        );
        expect(unlockRes.status).toBe(200);
        expect((await readJson(unlockRes)).data.status).toBe("active");
    });
});
