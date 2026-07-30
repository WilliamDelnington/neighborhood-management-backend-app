import { describe, it, expect } from "vitest";
import {
    GET as listNeighborhoodsRoute,
    POST as createNeighborhoodRoute,
} from "@/app/api/neighborhoods/route";
import { PUT as assignLeaderRoute } from "@/app/api/neighborhoods/[id]/leader/route";
import { GET as leaderHistoryRoute } from "@/app/api/neighborhoods/[id]/leader-history/route";
import { Neighborhood, NeighborhoodLeaderAssignment, User } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createNeighborhood(
    headers: Record<string, string>,
    code: string,
    sequence: number,
) {
    return readJson(
        await createNeighborhoodRoute(
            makeRequest("/api/neighborhoods", {
                method: "POST",
                headers,
                body: { name: `Tổ dân phố ${code}`, code, sequence },
            }),
        ),
    );
}

describe("Neighborhood: tao va gan to truong", () => {
    it("tu choi tao trung code hoac sequence (409)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        await createNeighborhood(headers, "TDP-01", 1);

        const res = await createNeighborhoodRoute(
            makeRequest("/api/neighborhoods", {
                method: "POST",
                headers,
                body: { name: "Trung", code: "TDP-01", sequence: 2 },
            }),
        );
        expect(res.status).toBe(409);
    });

    it("tu choi neighborhood_leader goi POST/PATCH (thieu quyen neighborhoods.manage)", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const headers = await authHeaders(leader);
        const res = await createNeighborhoodRoute(
            makeRequest("/api/neighborhoods", {
                method: "POST",
                headers,
                body: { name: "X", code: "TDP-09", sequence: 9 },
            }),
        );
        expect(res.status).toBe(403);
    });

    it("tu choi gan lam to truong nguoi khong co vai tro neighborhood_leader", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-02", 2);
        const notLeader = await createTestUser({ roles: ["house_owner"] });

        const res = await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: String(notLeader._id) },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(422);
    });

    it("gan to truong: cap nhat Neighborhood.leaderUserId, User.neighborhoodId va tao lich su phan cong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-03", 3);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        const res = await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: String(leader._id) },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(200);

        const neighborhood = await Neighborhood.findById(created.data._id);
        expect(String(neighborhood!.leaderUserId)).toBe(String(leader._id));

        const updatedLeader = await User.findById(leader._id);
        expect(String(updatedLeader!.neighborhoodId)).toBe(String(created.data._id));
        expect(
            updatedLeader!.assignedNeighborhoodIds.map(String),
        ).toContain(String(created.data._id));

        const activeAssignment = await NeighborhoodLeaderAssignment.findOne({
            neighborhoodId: created.data._id,
            unassignedAt: { $exists: false },
        });
        expect(activeAssignment).not.toBeNull();
        expect(String(activeAssignment!.leaderUserId)).toBe(String(leader._id));
    });

    it("chuyen to truong sang to dan pho khac: dong phan cong cu, mo phan cong moi, xoa lien ket to cu", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(headers, "TDP-04", 4);
        const neighborhoodB = await createNeighborhood(headers, "TDP-05", 5);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodA.data._id}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: String(leader._id) },
            }),
            { params: { id: neighborhoodA.data._id } },
        );

        await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodB.data._id}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: String(leader._id) },
            }),
            { params: { id: neighborhoodB.data._id } },
        );

        const oldNeighborhood = await Neighborhood.findById(neighborhoodA.data._id);
        expect(oldNeighborhood!.leaderUserId).toBeUndefined();

        const newNeighborhood = await Neighborhood.findById(neighborhoodB.data._id);
        expect(String(newNeighborhood!.leaderUserId)).toBe(String(leader._id));

        const updatedLeader = await User.findById(leader._id);
        expect(String(updatedLeader!.neighborhoodId)).toBe(String(neighborhoodB.data._id));
        expect(updatedLeader!.assignedNeighborhoodIds.map(String)).toEqual([
            String(neighborhoodB.data._id),
        ]);

        const oldAssignment = await NeighborhoodLeaderAssignment.findOne({
            neighborhoodId: neighborhoodA.data._id,
        });
        expect(oldAssignment!.unassignedAt).toBeDefined();
    });

    it("go gan to truong (leaderUserId=null): dong phan cong, xoa lien ket user", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-06", 6);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: String(leader._id) },
            }),
            { params: { id: created.data._id } },
        );

        await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: null },
            }),
            { params: { id: created.data._id } },
        );

        const neighborhood = await Neighborhood.findById(created.data._id);
        expect(neighborhood!.leaderUserId).toBeUndefined();

        const updatedLeader = await User.findById(leader._id);
        expect(updatedLeader!.neighborhoodId).toBeUndefined();
        expect(updatedLeader!.assignedNeighborhoodIds).toEqual([]);

        const history = await readJson(
            await leaderHistoryRoute(
                makeRequest(`/api/neighborhoods/${created.data._id}/leader-history`, {
                    headers,
                }),
                { params: { id: created.data._id } },
            ),
        );
        expect(history.data).toHaveLength(1);
        expect(history.data[0].unassignedAt).toBeTruthy();
    });

    it("neighborhood_leader chi thay to dan pho minh phu trach khi liet ke", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(headers, "TDP-07", 7);
        await createNeighborhood(headers, "TDP-08", 8);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodA.data._id}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: String(leader._id) },
            }),
            { params: { id: neighborhoodA.data._id } },
        );

        const leaderHeaders = await authHeaders(await User.findById(leader._id) as any);
        const res = await readJson(
            await listNeighborhoodsRoute(
                makeRequest("/api/neighborhoods", { headers: leaderHeaders }),
            ),
        );
        expect(res.data.total).toBe(1);
        expect(res.data.items[0]._id).toBe(neighborhoodA.data._id);
    });
});
