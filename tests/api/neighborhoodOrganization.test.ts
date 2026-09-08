import { describe, expect, it } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { PATCH as updateNeighborhoodRoute } from "@/app/api/neighborhoods/[id]/route";
import { PUT as assignLeaderRoute } from "@/app/api/neighborhoods/[id]/leader/route";
import {
    DELETE as unassignCollaboratorRoute,
    POST as assignCollaboratorRoute,
} from "@/app/api/neighborhoods/[id]/collaborators/route";
import {
    Neighborhood,
    NeighborhoodLeaderAssignment,
    NeighborhoodCollaboratorAssignment,
    User,
} from "@/models";
import { areaScopeFilter } from "@/lib/rbac";
import { authHeaders, createTestUser, makeRequest, readJson } from "../helpers";

const ward = (wardCode: number) => ({
    provinceCode: 79,
    provinceName: "TP Hồ Chí Minh",
    wardCode,
    wardName: `Phường ${wardCode}`,
});

async function createNeighborhood(
    headers: Record<string, string>,
    code: string,
    sequence: number,
    wardCode = 26734,
) {
    const response = await createNeighborhoodRoute(
        makeRequest("/api/neighborhoods", {
            method: "POST",
            headers,
            body: {
                name: `Tổ ${code}`,
                code,
                sequence,
                status: "ACTIVE",
                ...ward(wardCode),
            },
        }),
    );
    const json = await readJson(response);
    return { ...json, httpStatus: response.status };
}

describe("Neighborhood organization", () => {
    it("chi rang buoc ma To duy nhat trong cung Phuong/Xa", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        expect((await createNeighborhood(headers, "TDP-X", 901, 26734)).httpStatus).toBe(201);
        expect((await createNeighborhood(headers, "TDP-X", 902, 26734)).httpStatus).toBe(409);
        expect((await createNeighborhood(headers, "TDP-X", 903, 26735)).httpStatus).toBe(201);
    });

    it("can bo Phuong chi duoc sua To trong wardCode cua minh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const sameWard = await createNeighborhood(adminHeaders, "TDP-W1", 904, 26734);
        const otherWard = await createNeighborhood(adminHeaders, "TDP-W2", 905, 26735);
        const official = await createTestUser({
            roles: ["people_committee_official"],
            wardCode: 26734,
        });
        const headers = await authHeaders(official);

        const allowed = await updateNeighborhoodRoute(
            makeRequest(`/api/neighborhoods/${sameWard.data._id}`, {
                method: "PATCH",
                headers,
                body: { description: "Đúng phạm vi" },
            }),
            { params: { id: sameWard.data._id } },
        );
        expect(allowed.status).toBe(200);

        const denied = await updateNeighborhoodRoute(
            makeRequest(`/api/neighborhoods/${otherWard.data._id}`, {
                method: "PATCH",
                headers,
                body: { description: "Sai phạm vi" },
            }),
            { params: { id: otherWard.data._id } },
        );
        expect(denied.status).toBe(403);
    });

    it("go phan cong to truong thu hoi scope nhung giu lich su phan cong (khong con khai niem nhiem ky)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-T", 906);
        const neighborhoodId = created.data._id as string;
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        const assignmentResponse = await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodId}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: String(leader._id) },
            }),
            { params: { id: neighborhoodId } },
        );
        expect(assignmentResponse.status).toBe(200);

        const unassignResponse = await assignLeaderRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodId}/leader`, {
                method: "PUT",
                headers,
                body: { leaderUserId: null },
            }),
            { params: { id: neighborhoodId } },
        );
        expect(unassignResponse.status).toBe(200);

        const [neighborhood, refreshedLeader, assignment] = await Promise.all([
            Neighborhood.findById(neighborhoodId),
            User.findById(leader._id),
            NeighborhoodLeaderAssignment.findOne({ neighborhoodId }),
        ]);
        expect(neighborhood?.leaderUserId).toBeUndefined();
        expect(refreshedLeader?.assignedNeighborhoodIds).toHaveLength(0);
        expect(assignment?.unassignedAt).toBeDefined();
    });

    it("phan cong cong tac vien co scope rieng va ket thuc khong xoa tai khoan", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-C", 907);
        const neighborhoodId = created.data._id as string;
        const collaborator = await createTestUser({
            roles: ["neighborhood_collaborator"],
        });

        const assignedResponse = await assignCollaboratorRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodId}/collaborators`, {
                method: "POST",
                headers,
                body: {
                    collaboratorUserId: String(collaborator._id),
                    scopeType: "WHOLE_NEIGHBORHOOD",
                    endAt: "2028-12-31",
                },
            }),
            { params: { id: neighborhoodId } },
        );
        const assigned = await readJson(assignedResponse);
        expect(assignedResponse.status).toBe(201);

        const refreshed = await User.findById(collaborator._id);
        expect(refreshed?.assignedNeighborhoodIds.map(String)).toContain(neighborhoodId);
        expect(await areaScopeFilter(refreshed!)).toEqual({ _id: { $in: [] } });

        const unassignedResponse = await unassignCollaboratorRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodId}/collaborators`, {
                method: "DELETE",
                headers,
                body: { assignmentId: assigned.data._id },
            }),
            { params: { id: neighborhoodId } },
        );
        expect(unassignedResponse.status).toBe(200);
        expect(await User.exists({ _id: collaborator._id })).toBeTruthy();
        expect(
            (await User.findById(collaborator._id))?.assignedNeighborhoodIds,
        ).toHaveLength(0);
        expect(
            await NeighborhoodCollaboratorAssignment.exists({
                _id: assigned.data._id,
                unassignedAt: { $exists: true },
            }),
        ).toBeTruthy();
    });
});
