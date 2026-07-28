import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import {
    POST as createHouseholdRoute,
    GET as listHouseholdsRoute,
} from "@/app/api/households/route";
import {
    POST as createCitizenRoute,
    GET as listCitizensRoute,
} from "@/app/api/citizens/route";
import { GET as listHouseholdCitizensRoute } from "@/app/api/households/[id]/citizens/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function setupOwnerWithHouseholdAndCitizen(clusterName: string) {
    const owner = await createTestUser({
        roles: ["house_owner"],
        address: `Địa chỉ tại ${clusterName}`,
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

    const householdRes = await createHouseholdRoute(
        makeRequest("/api/households", {
            method: "POST",
            headers,
            body: {
                cluster: clusterName,
                address: `Số 1, ${clusterName}`,
                headOfHousehold: owner.displayName,
                houseId: house._id,
            },
        }),
    );
    const household = (await readJson(householdRes)).data;

    const citizenRes = await createCitizenRoute(
        makeRequest("/api/citizens", {
            method: "POST",
            headers,
            body: { fullName: owner.displayName, householdId: household._id },
        }),
    );
    const citizen = (await readJson(citizenRes)).data;

    return { owner, headers, house, household, citizen };
}

describe("Quyen so huu nha/ho dan/nhan khau cua houseOwner (house ownership scoping)", () => {
    it("houseOwner chi thay ho dan cua chinh minh, khong thay ho dan cua houseOwner khac (bug bao cao)", async () => {
        const a = await setupOwnerWithHouseholdAndCitizen("Cụm A");
        await setupOwnerWithHouseholdAndCitizen("Cụm B");

        const res = await listHouseholdsRoute(
            makeRequest("/api/households", { headers: a.headers }),
        );
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.items.map((h: any) => h._id)).toEqual([
            a.household._id,
        ]);
    });

    it("houseOwner chi thay nhan khau cua chinh minh, khong thay nhan khau cua houseOwner khac", async () => {
        const a = await setupOwnerWithHouseholdAndCitizen("Cụm A");
        await setupOwnerWithHouseholdAndCitizen("Cụm B");

        const res = await listCitizensRoute(
            makeRequest("/api/citizens", { headers: a.headers }),
        );
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.items.map((c: any) => c._id)).toEqual([
            a.citizen._id,
        ]);
    });

    it("nhan vien (assignedClusters rong) van thay duoc toan bo ho dan/nhan khau nhu truoc", async () => {
        const a = await setupOwnerWithHouseholdAndCitizen("Cụm A");
        const b = await setupOwnerWithHouseholdAndCitizen("Cụm B");
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const leaderHeaders = await authHeaders(leader);

        const householdsRes = await listHouseholdsRoute(
            makeRequest("/api/households", { headers: leaderHeaders }),
        );
        const householdsJson = await readJson(householdsRes);
        const householdIds = householdsJson.data.items.map((h: any) => h._id);
        expect(householdIds).toContain(a.household._id);
        expect(householdIds).toContain(b.household._id);

        const citizensRes = await listCitizensRoute(
            makeRequest("/api/citizens", { headers: leaderHeaders }),
        );
        const citizensJson = await readJson(citizensRes);
        const citizenIds = citizensJson.data.items.map((c: any) => c._id);
        expect(citizenIds).toContain(a.citizen._id);
        expect(citizenIds).toContain(b.citizen._id);
    });

    it("houseOwner khac khong the goi truc tiep GET /api/households/:id/citizens de xem nhan khau cua ho dan khong phai cua minh", async () => {
        const a = await setupOwnerWithHouseholdAndCitizen("Cụm A");
        const b = await setupOwnerWithHouseholdAndCitizen("Cụm B");

        const res = await listHouseholdCitizensRoute(
            makeRequest(`/api/households/${a.household._id}/citizens`, {
                headers: b.headers,
            }),
            { params: { id: a.household._id } },
        );
        expect(res.status).toBe(403);
    });

    it("chinh chu ho dan goi duoc GET /api/households/:id/citizens cho ho dan cua minh", async () => {
        const a = await setupOwnerWithHouseholdAndCitizen("Cụm A");

        const res = await listHouseholdCitizensRoute(
            makeRequest(`/api/households/${a.household._id}/citizens`, {
                headers: a.headers,
            }),
            { params: { id: a.household._id } },
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.items.map((c: any) => c._id)).toEqual([
            a.citizen._id,
        ]);
    });
});
