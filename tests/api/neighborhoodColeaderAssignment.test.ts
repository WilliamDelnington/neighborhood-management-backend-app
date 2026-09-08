import { describe, it, expect } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import {
    POST as assignColeaderRoute,
    DELETE as unassignColeaderRoute,
} from "@/app/api/neighborhoods/[id]/coleaders/route";
import { NeighborhoodColeaderAssignment, User } from "@/models";
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
        ),
    );
}

describe("Neighborhood: gan/huy gan to pho (coleader)", () => {
    it("gan to pho -> tao phan cong, gan assignedNeighborhoodIds", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-CL02", 502);
        const coleader = await createTestUser({
            roles: ["neighborhood_coleader"],
        });

        const res = await assignColeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/coleaders`, {
                method: "POST",
                headers,
                body: { coleaderUserId: String(coleader._id) },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(200);

        const assignment = await NeighborhoodColeaderAssignment.findOne({
            neighborhoodId: created.data._id,
            unassignedAt: { $exists: false },
        });
        expect(assignment).not.toBeNull();

        const refreshed = await User.findById(coleader._id);
        expect(refreshed!.assignedNeighborhoodIds.map(String)).toContain(
            String(created.data._id),
        );
    });

    it("1 nguoi chi duoc la to pho active o 1 to dan pho - tu choi neu dang la to pho o to khac (409)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const neighborhoodA = await createNeighborhood(headers, "TDP-CL05", 505);
        const neighborhoodB = await createNeighborhood(headers, "TDP-CL06", 506);
        const coleader = await createTestUser({
            roles: ["neighborhood_coleader"],
        });

        await assignColeaderRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodA.data._id}/coleaders`, {
                method: "POST",
                headers,
                body: { coleaderUserId: String(coleader._id) },
            }),
            { params: { id: neighborhoodA.data._id } },
        );

        const res = await assignColeaderRoute(
            makeRequest(`/api/neighborhoods/${neighborhoodB.data._id}/coleaders`, {
                method: "POST",
                headers,
                body: { coleaderUserId: String(coleader._id) },
            }),
            { params: { id: neighborhoodB.data._id } },
        );
        expect(res.status).toBe(409);
    });

    it("huy gan to pho (DELETE) khong xoa vai tro khoi tai khoan", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-CL04", 504);
        const coleader = await createTestUser({
            roles: ["neighborhood_coleader"],
        });

        await assignColeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/coleaders`, {
                method: "POST",
                headers,
                body: { coleaderUserId: String(coleader._id) },
            }),
            { params: { id: created.data._id } },
        );

        const res = await unassignColeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/coleaders`, {
                method: "DELETE",
                headers,
                body: { coleaderUserId: String(coleader._id) },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(200);

        const refreshed = await User.findById(coleader._id);
        expect(refreshed!.roles).toContain("neighborhood_coleader");
        expect(refreshed!.assignedNeighborhoodIds).toHaveLength(0);
    });
});
