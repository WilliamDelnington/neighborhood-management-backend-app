import { describe, it, expect } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { GET as listUsersRoute } from "@/app/api/users/route";
import { GET as getUserRoute } from "@/app/api/users/[id]/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

/**
 * Kiem tra fix "to truong van xem duoc muc Nguoi dung, nhung chi gioi han
 * trong pham vi to dan pho minh phu trach" - truoc day to truong khong co
 * users.read nen khong vao duoc man hinh nay; gio users.read duoc cap nhung
 * userService.listUsers/getUserById tu dong gioi han theo pham vi (khong phai
 * mo toan bo danh sach nguoi dung he thong).
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

describe("To truong xem danh sach nguoi dung, gioi han theo to dan pho (users.read scoped)", () => {
    it("to truong chi thay chu nha co nha trong to dan pho minh phu trach, khong thay chu nha to khac hay nhan vien khac", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "USR-A1", 301);
        const neighborhoodB = await createNeighborhood(adminHeaders, "USR-B1", 302);

        const ownerA = await createTestUser({ roles: ["house_owner"] });
        const ownerAHeaders = await authHeaders(ownerA);
        await createOwnedHouse(ownerAHeaders, neighborhoodA._id, "Số 1, TDP A");

        const ownerB = await createTestUser({ roles: ["house_owner"] });
        const ownerBHeaders = await authHeaders(ownerB);
        await createOwnedHouse(ownerBHeaders, neighborhoodB._id, "Số 1, TDP B");

        const secretary = await createTestUser({ roles: ["secretary"] });

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);

        const listRes = await listUsersRoute(
            makeRequest("/api/users?limit=100", { headers: leaderAHeaders }),
        );
        expect(listRes.status).toBe(200);
        const ids = (await readJson(listRes)).data.items.map((u: any) => u.id);

        expect(ids).toContain(String(ownerA._id));
        expect(ids).not.toContain(String(ownerB._id));
        expect(ids).not.toContain(String(secretary._id));
        expect(ids).not.toContain(String(admin._id));
        expect(ids).not.toContain(String(leaderA._id));
    });

    it("to truong GET truc tiep chu nha ngoai pham vi -> 403; chu nha trong pham vi -> 200", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "USR-A2", 303);
        const neighborhoodB = await createNeighborhood(adminHeaders, "USR-B2", 304);

        const ownerA = await createTestUser({ roles: ["house_owner"] });
        const ownerAHeaders = await authHeaders(ownerA);
        await createOwnedHouse(ownerAHeaders, neighborhoodA._id, "Số 2, TDP A");

        const ownerB = await createTestUser({ roles: ["house_owner"] });
        const ownerBHeaders = await authHeaders(ownerB);
        await createOwnedHouse(ownerBHeaders, neighborhoodB._id, "Số 2, TDP B");

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);

        const getOwnerBRes = await getUserRoute(
            makeRequest(`/api/users/${ownerB._id}`, { headers: leaderAHeaders }),
            { params: { id: String(ownerB._id) } },
        );
        expect(getOwnerBRes.status).toBe(403);

        const getOwnerARes = await getUserRoute(
            makeRequest(`/api/users/${ownerA._id}`, { headers: leaderAHeaders }),
            { params: { id: String(ownerA._id) } },
        );
        expect(getOwnerARes.status).toBe(200);
    });

    it("admin van xem duoc toan bo danh sach nguoi dung, khong gioi han", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(adminHeaders, "USR-A3", 305);

        const ownerA = await createTestUser({ roles: ["house_owner"] });
        const ownerAHeaders = await authHeaders(ownerA);
        await createOwnedHouse(ownerAHeaders, neighborhoodA._id, "Số 3, TDP A");
        const secretary = await createTestUser({ roles: ["secretary"] });

        const listRes = await listUsersRoute(
            makeRequest("/api/users?limit=100", { headers: adminHeaders }),
        );
        const ids = (await readJson(listRes)).data.items.map((u: any) => u.id);
        expect(ids).toContain(String(ownerA._id));
        expect(ids).toContain(String(secretary._id));
    });

    it("to truong chua duoc phan cong to dan pho nao -> danh sach rong, khong loi", async () => {
        const leaderNone = await createTestUser({ roles: ["neighborhood_leader"] });
        const leaderNoneHeaders = await authHeaders(leaderNone);

        const listRes = await listUsersRoute(
            makeRequest("/api/users?limit=100", { headers: leaderNoneHeaders }),
        );
        expect(listRes.status).toBe(200);
        expect((await readJson(listRes)).data.items).toHaveLength(0);
    });
});
