import { describe, it, expect } from "vitest";
import { GET as getMyManagementScopeRoute } from "@/app/api/auth/me/management-scope/route";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { User } from "@/models";
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
            body: {
                name: `To dan pho ${code}`,
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

describe("GET /api/auth/me/management-scope (Phạm vi quản lý cua chinh nguoi dang dang nhap)", () => {
    // Regression: getUserManagementScope() truoc day CHI doc ScopeAssignment,
    // trong khi rbac.neighborhoodScopeFilter (loc du lieu THUC SU) doc
    // user.neighborhoodId/assignedNeighborhoodIds - mot tai khoan co truong
    // cache nay nhung THIEU ban ghi ScopeAssignment tuong ung (du lieu seed/
    // nhap tay cu, hoac truoc khi chay
    // scripts/migrate-neighborhood-assignments-to-scope-assignment.ts) se bi
    // hien thi sai "khong quan ly gi" du dang thuc su quan ly mot to dan pho.
    it("van hien thi to dan pho dang quan ly ke ca khi chi co user.neighborhoodId, khong co ban ghi ScopeAssignment", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const neighborhood = await createNeighborhood(adminHeaders, "TDP-71", 71);

        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        // Gia lap du lieu CU: chi set truong cache truc tiep tren User, KHONG
        // di qua assignNeighborhoodLeader/assignScope (nen khong co ScopeAssignment).
        await User.findByIdAndUpdate(leader._id, {
            neighborhoodId: neighborhood._id,
        });
        const leaderHeaders = await authHeaders(leader);

        const res = await getMyManagementScopeRoute(
            makeRequest("/api/auth/me/management-scope", {
                headers: leaderHeaders,
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        const entry = json.data.scopes.find(
            (s: any) => s.roleKey === "neighborhood_leader",
        );
        expect(entry).toBeTruthy();
        expect(entry.unrestricted).toBe(false);
        expect(entry.items.map((i: any) => i.id)).toContain(
            String(neighborhood._id),
        );
    });

    it("khong hien thi gi neu chua duoc gan to dan pho nao (ca cache lan ScopeAssignment)", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const leaderHeaders = await authHeaders(leader);

        const res = await getMyManagementScopeRoute(
            makeRequest("/api/auth/me/management-scope", {
                headers: leaderHeaders,
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(
            json.data.scopes.find((s: any) => s.roleKey === "neighborhood_leader"),
        ).toBeUndefined();
    });
});
