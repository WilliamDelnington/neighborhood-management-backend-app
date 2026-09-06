import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { PATCH as transitionStatusRoute } from "@/app/api/houses/[id]/status/route";
import { PATCH as bulkNeighborhoodRoute } from "@/app/api/houses/bulk-neighborhood/route";
import { PATCH as bulkStatusRoute } from "@/app/api/houses/bulk-status/route";
import { HouseRecord } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createHouse(
    headers: Record<string, string>,
    address: string,
    cluster = "Cụm bulk",
) {
    const res = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers,
            body: { cluster, address },
        }),
    );
    return (await readJson(res)).data;
}

async function createNeighborhood(
    headers: Record<string, string>,
    code: string,
    sequence: number,
) {
    const res = await createNeighborhoodRoute(
        makeRequest("/api/neighborhoods", {
            method: "POST",
            headers,
            body: {
                name: `Tổ dân phố ${code}`,
                code,
                sequence,
                provinceCode: 79,
                provinceName: "TP Hồ Chí Minh",
                wardCode: 26734,
                wardName: "Phường thử nghiệm",
            },
        }),
    );
    return (await readJson(res)).data;
}

async function setStatus(
    adminHeaders: Record<string, string>,
    houseId: string,
    status: string,
) {
    await transitionStatusRoute(
        makeRequest(`/api/houses/${houseId}/status`, {
            method: "PATCH",
            headers: adminHeaders,
            body: { status },
        }),
        { params: { id: houseId } },
    );
}

describe("Thao tac hang loat (bulk) tren danh sach Nha so", () => {
    it("gan to dan pho hang loat cho cac nha chua co to dan pho", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhood = await createNeighborhood(adminHeaders, "BLK-01", 701);
        const houseA = await createHouse(adminHeaders, "Số 1, Cụm bulk");
        const houseB = await createHouse(adminHeaders, "Số 2, Cụm bulk");
        expect(houseA.neighborhoodId).toBeUndefined();

        const res = await bulkNeighborhoodRoute(
            makeRequest("/api/houses/bulk-neighborhood", {
                method: "PATCH",
                headers: adminHeaders,
                body: {
                    ids: [houseA._id, houseB._id],
                    neighborhoodId: neighborhood._id,
                },
            }),
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.succeededIds.sort()).toEqual(
            [houseA._id, houseB._id].sort(),
        );
        expect(json.data.failed).toHaveLength(0);

        const refreshedA = await HouseRecord.findById(houseA._id);
        const refreshedB = await HouseRecord.findById(houseB._id);
        expect(String(refreshedA!.neighborhoodId)).toBe(neighborhood._id);
        expect(String(refreshedB!.neighborhoodId)).toBe(neighborhood._id);
    });

    it("nha da verified bi tu choi rieng khi gan hang loat, khong lam dung nha con lai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhood = await createNeighborhood(adminHeaders, "BLK-02", 702);
        const houseOk = await createHouse(adminHeaders, "Số 3, Cụm bulk");
        const houseVerified = await createHouse(adminHeaders, "Số 4, Cụm bulk");
        await setStatus(adminHeaders, houseVerified._id, "verified");

        const res = await bulkNeighborhoodRoute(
            makeRequest("/api/houses/bulk-neighborhood", {
                method: "PATCH",
                headers: adminHeaders,
                body: {
                    ids: [houseOk._id, houseVerified._id],
                    neighborhoodId: neighborhood._id,
                },
            }),
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.succeededIds).toEqual([houseOk._id]);
        expect(json.data.failed).toHaveLength(1);
        expect(json.data.failed[0].id).toBe(houseVerified._id);
        expect(json.data.failed[0].message).toContain("yêu cầu thay đổi thông tin");

        const refreshedVerified = await HouseRecord.findById(houseVerified._id);
        expect(refreshedVerified!.neighborhoodId).toBeUndefined();
    });

    it("duyet hang loat cac nha dang cho duyet", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const houseA = await createHouse(adminHeaders, "Số 5, Cụm bulk");
        const houseB = await createHouse(adminHeaders, "Số 6, Cụm bulk");
        await setStatus(adminHeaders, houseA._id, "pending");
        await setStatus(adminHeaders, houseB._id, "pending");

        const res = await bulkStatusRoute(
            makeRequest("/api/houses/bulk-status", {
                method: "PATCH",
                headers: adminHeaders,
                body: { ids: [houseA._id, houseB._id], status: "verified" },
            }),
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.succeededIds.sort()).toEqual(
            [houseA._id, houseB._id].sort(),
        );

        const refreshedA = await HouseRecord.findById(houseA._id);
        const refreshedB = await HouseRecord.findById(houseB._id);
        expect(refreshedA!.status).toBe("verified");
        expect(refreshedB!.status).toBe("verified");
    });

    it("nha khong o trang thai cho duyet bi tu choi rieng khi duyet hang loat", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const secretary = await createTestUser({ roles: ["secretary"] });
        const secretaryHeaders = await authHeaders(secretary);

        const housePending = await createHouse(adminHeaders, "Số 7, Cụm bulk");
        const houseUnverified = await createHouse(adminHeaders, "Số 8, Cụm bulk");
        await setStatus(adminHeaders, housePending._id, "pending");

        const res = await bulkStatusRoute(
            makeRequest("/api/houses/bulk-status", {
                method: "PATCH",
                headers: secretaryHeaders,
                body: {
                    ids: [housePending._id, houseUnverified._id],
                    status: "verified",
                },
            }),
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.succeededIds).toEqual([housePending._id]);
        expect(json.data.failed).toHaveLength(1);
        expect(json.data.failed[0].id).toBe(houseUnverified._id);
    });

    it("tu choi hang loat bat buoc phai co ly do (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const house = await createHouse(adminHeaders, "Số 9, Cụm bulk");
        await setStatus(adminHeaders, house._id, "pending");

        const res = await bulkStatusRoute(
            makeRequest("/api/houses/bulk-status", {
                method: "PATCH",
                headers: adminHeaders,
                body: { ids: [house._id], status: "denied" },
            }),
        );
        expect(res.status).toBe(422);
    });

    it("danh sach id rong bi tu choi (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhood = await createNeighborhood(adminHeaders, "BLK-03", 703);

        const res = await bulkNeighborhoodRoute(
            makeRequest("/api/houses/bulk-neighborhood", {
                method: "PATCH",
                headers: adminHeaders,
                body: { ids: [], neighborhoodId: neighborhood._id },
            }),
        );
        expect(res.status).toBe(422);
    });

    it("nguoi khong co quyen houses.update bi tu choi (403)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const neighborhood = await createNeighborhood(adminHeaders, "BLK-04", 704);
        const house = await createHouse(adminHeaders, "Số 10, Cụm bulk");

        const regionalPolice = await createTestUser({ roles: ["regional_police"] });
        const regionalPoliceHeaders = await authHeaders(regionalPolice);

        const res = await bulkNeighborhoodRoute(
            makeRequest("/api/houses/bulk-neighborhood", {
                method: "PATCH",
                headers: regionalPoliceHeaders,
                body: { ids: [house._id], neighborhoodId: neighborhood._id },
            }),
        );
        expect(res.status).toBe(403);
    });
});
