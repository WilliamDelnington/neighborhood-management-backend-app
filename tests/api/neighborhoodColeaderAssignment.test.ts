import { describe, it, expect } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { POST as createTermRoute } from "@/app/api/neighborhoods/[id]/terms/route";
import { PATCH as updateTermRoute } from "@/app/api/neighborhoods/[id]/terms/[termId]/route";
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

async function createActiveTerm(
    headers: Record<string, string>,
    neighborhoodId: string,
) {
    const res = await createTermRoute(
        makeRequest(`/api/neighborhoods/${neighborhoodId}/terms`, {
            method: "POST",
            headers,
            body: {
                name: `Nhiệm kỳ ${neighborhoodId}`,
                startAt: "2026-01-01",
                endAt: "2028-12-31",
                status: "ACTIVE",
            },
        }),
        { params: { id: neighborhoodId } },
    );
    return readJson(res);
}

describe("Neighborhood: gan/huy gan to pho (coleader), bat buoc nhiem ky", () => {
    it("tu choi gan to pho khi chua chon nhiem ky dang ACTIVE (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-CL01", 501);
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
        expect(res.status).toBe(422);
        expect(
            await NeighborhoodColeaderAssignment.exists({
                neighborhoodId: created.data._id,
            }),
        ).toBeFalsy();
    });

    it("gan to pho voi nhiem ky hop le -> tao phan cong, gan assignedNeighborhoodIds", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-CL02", 502);
        const coleader = await createTestUser({
            roles: ["neighborhood_coleader"],
        });
        const term = await createActiveTerm(headers, created.data._id);

        const res = await assignColeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/coleaders`, {
                method: "POST",
                headers,
                body: {
                    coleaderUserId: String(coleader._id),
                    termId: term.data._id,
                },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(200);

        const assignment = await NeighborhoodColeaderAssignment.findOne({
            neighborhoodId: created.data._id,
            unassignedAt: { $exists: false },
        });
        expect(assignment).not.toBeNull();
        expect(String(assignment!.termId)).toBe(term.data._id);

        const refreshed = await User.findById(coleader._id);
        expect(refreshed!.assignedNeighborhoodIds.map(String)).toContain(
            String(created.data._id),
        );
    });

    it("ket thuc nhiem ky se thu hoi to pho nhung KHONG xoa vai tro khoi tai khoan", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-CL03", 503);
        const coleader = await createTestUser({
            roles: ["neighborhood_coleader"],
        });
        const term = await createActiveTerm(headers, created.data._id);

        await assignColeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/coleaders`, {
                method: "POST",
                headers,
                body: {
                    coleaderUserId: String(coleader._id),
                    termId: term.data._id,
                },
            }),
            { params: { id: created.data._id } },
        );

        const endRes = await updateTermRoute(
            makeRequest(
                `/api/neighborhoods/${created.data._id}/terms/${term.data._id}`,
                { method: "PATCH", headers, body: { status: "ENDED" } },
            ),
            { params: { id: created.data._id, termId: term.data._id } },
        );
        expect(endRes.status).toBe(200);

        const [assignment, refreshed] = await Promise.all([
            NeighborhoodColeaderAssignment.findOne({
                neighborhoodId: created.data._id,
            }),
            User.findById(coleader._id),
        ]);
        expect(assignment!.unassignedAt).toBeDefined();
        expect(refreshed!.assignedNeighborhoodIds).toHaveLength(0);
        // Vai tro van con tren tai khoan - ket thuc nhiem ky chi thu hoi
        // pham vi quan ly, khong xoa vai tro (xem yeu cau nghiep vu).
        expect(refreshed!.roles).toContain("neighborhood_coleader");
    });

    it("huy gan to pho (DELETE) khong can nhiem ky", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createNeighborhood(headers, "TDP-CL04", 504);
        const coleader = await createTestUser({
            roles: ["neighborhood_coleader"],
        });
        const term = await createActiveTerm(headers, created.data._id);

        await assignColeaderRoute(
            makeRequest(`/api/neighborhoods/${created.data._id}/coleaders`, {
                method: "POST",
                headers,
                body: {
                    coleaderUserId: String(coleader._id),
                    termId: term.data._id,
                },
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
