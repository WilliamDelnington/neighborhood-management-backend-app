import { describe, it, expect } from "vitest";
import {
    GET as listHouseholdsRoute,
    POST as createHouseholdRoute,
} from "@/app/api/households/route";
import { GET as getHouseholdRoute } from "@/app/api/households/[id]/route";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import {
    GET as listComplaintsRoute,
    POST as createComplaintRoute,
} from "@/app/api/complaints/route";
import { GET as getComplaintRoute } from "@/app/api/complaints/[id]/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createNeighborhood(
    adminHeaders: Record<string, string>,
    code: string,
    sequence: number,
) {
    const res = await createNeighborhoodRoute(
        makeRequest("/api/neighborhoods", {
            method: "POST",
            headers: adminHeaders,
            body: { name: `To dan pho ${code}`, code, sequence },
        }),
    );
    return (await readJson(res)).data;
}

async function createHouseInNeighborhood(
    adminHeaders: Record<string, string>,
    neighborhoodId: string,
    address: string,
) {
    const res = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers: adminHeaders,
            body: { cluster: "Cụm chung", address, neighborhoodId },
        }),
    );
    return (await readJson(res)).data;
}

async function createHouseholdInHouse(
    adminHeaders: Record<string, string>,
    houseId: string,
    headOfHousehold: string,
) {
    const res = await createHouseholdRoute(
        makeRequest("/api/households", {
            method: "POST",
            headers: adminHeaders,
            body: {
                cluster: "Cụm chung",
                address: `Địa chỉ ${headOfHousehold}`,
                headOfHousehold,
                houseId,
            },
        }),
    );
    return (await readJson(res)).data;
}

describe("Neighborhood-scoped RBAC: to truong chi thay du lieu trong to dan pho cua minh", () => {
    it("households: to truong chi thay/xem duoc ho dan trong to dan pho duoc phan cong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const neighborhoodA = await createNeighborhood(adminHeaders, "TDP-51", 51);
        const neighborhoodB = await createNeighborhood(adminHeaders, "TDP-52", 52);

        const houseA = await createHouseInNeighborhood(
            adminHeaders,
            neighborhoodA._id,
            "Số 1 A",
        );
        const houseB = await createHouseInNeighborhood(
            adminHeaders,
            neighborhoodB._id,
            "Số 1 B",
        );

        const householdA = await createHouseholdInHouse(
            adminHeaders,
            houseA._id,
            "Chủ hộ A",
        );
        const householdB = await createHouseholdInHouse(
            adminHeaders,
            houseB._id,
            "Chủ hộ B",
        );
        expect(householdA.neighborhoodId).toBe(neighborhoodA._id);
        expect(householdB.neighborhoodId).toBe(neighborhoodB._id);

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);
        const leaderNone = await createTestUser({
            roles: ["neighborhood_leader"],
        });
        const leaderNoneHeaders = await authHeaders(leaderNone);

        const listAsLeaderA = await readJson(
            await listHouseholdsRoute(
                makeRequest("/api/households", { headers: leaderAHeaders }),
            ),
        );
        const idsSeenByLeaderA = listAsLeaderA.data.items.map((h: any) => h._id);
        expect(idsSeenByLeaderA).toContain(householdA._id);
        expect(idsSeenByLeaderA).not.toContain(householdB._id);

        const listAsLeaderNone = await readJson(
            await listHouseholdsRoute(
                makeRequest("/api/households", { headers: leaderNoneHeaders }),
            ),
        );
        expect(listAsLeaderNone.data.items).toHaveLength(0);

        const getHouseholdBAsLeaderA = await getHouseholdRoute(
            makeRequest(`/api/households/${householdB._id}`, {
                headers: leaderAHeaders,
            }),
            { params: { id: householdB._id } },
        );
        expect(getHouseholdBAsLeaderA.status).toBe(403);

        const getHouseholdAAsLeaderA = await getHouseholdRoute(
            makeRequest(`/api/households/${householdA._id}`, {
                headers: leaderAHeaders,
            }),
            { params: { id: householdA._id } },
        );
        expect(getHouseholdAAsLeaderA.status).toBe(200);
    });

    it("complaints: to truong chi thay/xem duoc phan anh cua nguoi thuoc to dan pho cua minh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const neighborhoodA = await createNeighborhood(adminHeaders, "TDP-53", 53);
        const neighborhoodB = await createNeighborhood(adminHeaders, "TDP-54", 54);
        const houseA = await createHouseInNeighborhood(
            adminHeaders,
            neighborhoodA._id,
            "Số 2 A",
        );
        const householdA = await createHouseholdInHouse(
            adminHeaders,
            houseA._id,
            "Chủ hộ phản ánh A",
        );

        const resident = await createTestUser({
            roles: ["house_owner"],
            householdId: householdA._id,
        });
        const residentHeaders = await authHeaders(resident);

        const complaintRes = await createComplaintRoute(
            makeRequest("/api/complaints", {
                method: "POST",
                headers: residentHeaders,
                body: {
                    category: "khac",
                    title: "Phản ánh thử",
                    content: "Nội dung thử nghiệm",
                },
            }),
        );
        const complaint = (await readJson(complaintRes)).data;
        expect(complaint.neighborhoodId).toBe(neighborhoodA._id);

        const leaderA = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodA._id,
        });
        const leaderAHeaders = await authHeaders(leaderA);
        const leaderB = await createTestUser({
            roles: ["neighborhood_leader"],
            neighborhoodId: neighborhoodB._id,
        });
        const leaderBHeaders = await authHeaders(leaderB);

        const listAsLeaderA = await readJson(
            await listComplaintsRoute(
                makeRequest("/api/complaints", { headers: leaderAHeaders }),
            ),
        );
        expect(
            listAsLeaderA.data.items.map((c: any) => c._id),
        ).toContain(complaint._id);

        const listAsLeaderB = await readJson(
            await listComplaintsRoute(
                makeRequest("/api/complaints", { headers: leaderBHeaders }),
            ),
        );
        expect(
            listAsLeaderB.data.items.map((c: any) => c._id),
        ).not.toContain(complaint._id);

        const getAsLeaderB = await getComplaintRoute(
            makeRequest(`/api/complaints/${complaint._id}`, {
                headers: leaderBHeaders,
            }),
            { params: { id: complaint._id } },
        );
        expect(getAsLeaderB.status).toBe(403);

        const getAsLeaderA = await getComplaintRoute(
            makeRequest(`/api/complaints/${complaint._id}`, {
                headers: leaderAHeaders,
            }),
            { params: { id: complaint._id } },
        );
        expect(getAsLeaderA.status).toBe(200);
    });
});
