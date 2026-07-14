import { describe, it, expect } from "vitest";
import { GET as listRolesRoute, POST as createRoleRoute } from "@/app/api/roles/route";
import {
    GET as getRoleRoute,
    PATCH as patchRoleRoute,
    DELETE as deleteRoleRoute,
} from "@/app/api/roles/[id]/route";
import { Role, User } from "@/models";
import { ALL_PERMISSION_KEYS } from "@/lib/permissionRegistry";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("POST /api/roles - tao vai tro", () => {
    it("admin (co roles.create) tao vai tro moi thanh cong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { key: "cluster_lead", name: "Trưởng cụm", permissions: ["households.read"] },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(201);
        expect(json.data.key).toBe("cluster_lead");
        expect(json.data.system).toBe(false);
    });

    it("tu choi 403 khi khong co quyen roles.create", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(leader),
                body: { key: "another_role", name: "Khac", permissions: [] },
            }),
        );
        expect(res.status).toBe(403);
    });

    it("tu choi key vai tro bi trung", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        await Role.create({ key: "dup_key", name: "Ban dau", permissions: [] });

        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { key: "dup_key", name: "Trung key", permissions: [] },
            }),
        );
        expect(res.status).toBe(409);
    });

    it("tu choi permission key khong ton tai trong registry", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: {
                    key: "bad_perm_role",
                    name: "Bad",
                    permissions: ["khong_ton_tai.xyz"],
                },
            }),
        );
        expect(res.status).toBe(422);
    });
});

describe("GET /api/roles - danh sach vai tro", () => {
    it("tra ve so nguoi dung dang gan cho tung vai tro", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        await createTestUser({ roles: ["resident"] });

        const res = await listRolesRoute(
            makeRequest("/api/roles", { headers: await authHeaders(admin) }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        const residentRole = json.data.find((r: any) => r.key === "resident");
        expect(residentRole.assignedUserCount).toBe(1);
    });
});

describe("PATCH /api/roles/:id - cap nhat vai tro", () => {
    it("cap nhat permissions thanh cong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const created = await readJson(
            await createRoleRoute(
                makeRequest("/api/roles", {
                    method: "POST",
                    headers: await authHeaders(admin),
                    body: { key: "editable_role", name: "Co the sua", permissions: [] },
                }),
            ),
        );

        const res = await patchRoleRoute(
            makeRequest(`/api/roles/${created.data._id}`, {
                method: "PATCH",
                headers: await authHeaders(admin),
                body: { permissions: ["households.read", "citizens.read"] },
            }),
            { params: { id: created.data._id } },
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.permissions).toEqual(["households.read", "citizens.read"]);
    });

    it("chan thao tac khien khong con ai co quyen roles.manage", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminRole = await Role.findOne({ key: "admin" });

        const res = await patchRoleRoute(
            makeRequest(`/api/roles/${adminRole!._id}`, {
                method: "PATCH",
                headers: await authHeaders(admin),
                body: {
                    permissions: ALL_PERMISSION_KEYS.filter(p => p !== "roles.manage"),
                },
            }),
            { params: { id: String(adminRole!._id) } },
        );
        expect(res.status).toBe(409);
    });
});

describe("DELETE /api/roles/:id - xoa vai tro", () => {
    it("khong the xoa vai tro he thong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminRole = await Role.findOne({ key: "admin" });

        const res = await deleteRoleRoute(
            makeRequest(`/api/roles/${adminRole!._id}`, {
                method: "DELETE",
                headers: await authHeaders(admin),
            }),
            { params: { id: String(adminRole!._id) } },
        );
        expect(res.status).toBe(409);
    });

    it("chan xoa vai tro custom dang duoc gan cho nguoi dung", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const created = await readJson(
            await createRoleRoute(
                makeRequest("/api/roles", {
                    method: "POST",
                    headers: await authHeaders(admin),
                    body: { key: "assigned_role", name: "Da gan", permissions: [] },
                }),
            ),
        );
        await User.create({
            zaloUserId: "role-crud-assignee",
            displayName: "Nguoi duoc gan",
            status: "active",
            roles: ["assigned_role"],
            primaryRole: "assigned_role",
        });

        const res = await deleteRoleRoute(
            makeRequest(`/api/roles/${created.data._id}`, {
                method: "DELETE",
                headers: await authHeaders(admin),
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(409);
    });

    it("cho phep xoa vai tro custom chua duoc gan cho ai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const created = await readJson(
            await createRoleRoute(
                makeRequest("/api/roles", {
                    method: "POST",
                    headers: await authHeaders(admin),
                    body: { key: "unused_role", name: "Chua dung", permissions: [] },
                }),
            ),
        );

        const res = await deleteRoleRoute(
            makeRequest(`/api/roles/${created.data._id}`, {
                method: "DELETE",
                headers: await authHeaders(admin),
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(200);
        expect(await Role.findById(created.data._id)).toBeNull();
    });
});

describe("GET /api/roles/:id", () => {
    it("tra ve 404 khi khong tim thay vai tro", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await getRoleRoute(
            makeRequest("/api/roles/000000000000000000000000", {
                headers: await authHeaders(admin),
            }),
            { params: { id: "000000000000000000000000" } },
        );
        expect(res.status).toBe(404);
    });
});
