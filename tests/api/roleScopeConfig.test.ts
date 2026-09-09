import { describe, it, expect } from "vitest";
import { POST as createRoleRoute } from "@/app/api/roles/route";
import { PATCH as updateRoleRoute } from "@/app/api/roles/[id]/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("Pham vi du lieu (scopeType/scopeMechanism/...) khi tao/sua vai tro", () => {
    it("mac dinh scopeType=ALL khi khong truyen gi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { key: "scope_default_role", name: "Mac dinh", permissions: [] },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(201);
        expect(json.data.scopeType).toBe("ALL");
        expect(json.data.scopeMechanism).toBeUndefined();
    });

    it("tao vai tro NEIGHBORHOOD voi subScopeKinds, roi sua sang WARD phai xoa subScopeKinds/gioi han", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const created = await readJson(
            await createRoleRoute(
                makeRequest("/api/roles", {
                    method: "POST",
                    headers: await authHeaders(admin),
                    body: {
                        key: "scope_neighborhood_role",
                        name: "Cong tac vien tuy chinh",
                        permissions: [],
                        scopeType: "NEIGHBORHOOD",
                        scopeMechanism: "ASSIGNED",
                        maxActivePerScope: null,
                        subScopeKinds: ["STREET", "CAMPAIGN"],
                    },
                }),
            ),
        );
        expect(created.data.scopeType).toBe("NEIGHBORHOOD");
        expect(created.data.subScopeKinds).toEqual(["STREET", "CAMPAIGN"]);

        const updated = await readJson(
            await updateRoleRoute(
                makeRequest(`/api/roles/${created.data._id}`, {
                    method: "PATCH",
                    headers: await authHeaders(admin),
                    body: {
                        scopeType: "WARD",
                        scopeMechanism: "ASSIGNED",
                        maxActivePerScope: 1,
                    },
                }),
                { params: { id: created.data._id } },
            ),
        );
        expect(updated.data.scopeType).toBe("WARD");
        expect(updated.data.maxActivePerScope).toBe(1);
        // subScopeKinds chi co y nghia voi NEIGHBORHOOD - phai duoc don dep
        // (xem Role.ts pre("validate")), khong duoc "con sot" tu luc con la
        // NEIGHBORHOOD.
        expect(updated.data.subScopeKinds).toBeUndefined();
    });

    it("sua sang scopeType OWNED (HOUSE) phai xoa maxActivePerScope/maxActiveScopesPerUser/scopeMechanism ve OWNED", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const created = await readJson(
            await createRoleRoute(
                makeRequest("/api/roles", {
                    method: "POST",
                    headers: await authHeaders(admin),
                    body: {
                        key: "scope_ward_role",
                        name: "Vai tro cap Phuong tuy chinh",
                        permissions: [],
                        scopeType: "WARD",
                        scopeMechanism: "ASSIGNED",
                        maxActivePerScope: 1,
                        maxActiveScopesPerUser: 1,
                    },
                }),
            ),
        );
        expect(created.data.maxActivePerScope).toBe(1);

        const updated = await readJson(
            await updateRoleRoute(
                makeRequest(`/api/roles/${created.data._id}`, {
                    method: "PATCH",
                    headers: await authHeaders(admin),
                    body: {
                        scopeType: "HOUSE",
                        scopeMechanism: "OWNED",
                    },
                }),
                { params: { id: created.data._id } },
            ),
        );
        expect(updated.data.scopeType).toBe("HOUSE");
        expect(updated.data.scopeMechanism).toBe("OWNED");
        expect(updated.data.maxActivePerScope).toBeNull();
        expect(updated.data.maxActiveScopesPerUser).toBeNull();
    });

    it("tu choi neu scopeType khac ALL nhung thieu scopeMechanism", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: {
                    key: "scope_missing_mechanism_role",
                    name: "Thieu co che",
                    permissions: [],
                    scopeType: "WARD",
                },
            }),
        );
        expect(res.status).toBe(500);
    });
});
