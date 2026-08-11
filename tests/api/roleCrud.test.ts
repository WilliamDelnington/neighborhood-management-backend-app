import { describe, it, expect } from "vitest";
import { GET as listRolesRoute, POST as createRoleRoute } from "@/app/api/roles/route";
import {
    GET as getRoleRoute,
    PATCH as patchRoleRoute,
    DELETE as deleteRoleRoute,
} from "@/app/api/roles/[id]/route";
import { GET as permissionRegistryRoute } from "@/app/api/roles/permissions/route";
import { Role, User } from "@/models";
import { ALL_PERMISSION_KEYS } from "@/lib/permissionRegistry";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("RBAC vai tro chi duoc xem", () => {
    it("cho Bi thu co roles.read xem danh sach nhung chan sua va xoa", async () => {
        const secretary = await createTestUser({ roles: ["secretary"] });
        await Role.updateOne(
            { key: "secretary" },
            { $addToSet: { permissions: "roles.read" } },
        );
        const target = await Role.create({
            key: "read_only_target",
            name: "Vai tro de kiem tra",
            permissions: [],
            active: true,
        });
        const headers = await authHeaders(secretary);

        const listRes = await listRolesRoute(
            makeRequest("/api/roles", { headers }),
        );
        expect(listRes.status).toBe(200);
        const registryRes = await permissionRegistryRoute(
            makeRequest("/api/roles/permissions", { headers }),
        );
        expect(registryRes.status).toBe(200);

        const patchRes = await patchRoleRoute(
            makeRequest(`/api/roles/${target._id}`, {
                method: "PATCH",
                headers,
                body: { name: "Khong duoc sua" },
            }),
            { params: { id: String(target._id) } },
        );
        expect(patchRes.status).toBe(403);

        const deleteRes = await deleteRoleRoute(
            makeRequest(`/api/roles/${target._id}`, {
                method: "DELETE",
                headers,
            }),
            { params: { id: String(target._id) } },
        );
        expect(deleteRes.status).toBe(403);
        expect(await Role.findById(target._id)).not.toBeNull();
    });

    it("chan roles.update tu them permission khi khong co roles.manage", async () => {
        const editorRole = await Role.create({
            key: "role_metadata_editor",
            name: "Nguoi sua metadata",
            permissions: ["roles.read", "roles.update"],
            active: true,
        });
        const editor = await createTestUser({
            roles: ["role_metadata_editor"],
        });

        const res = await patchRoleRoute(
            makeRequest(`/api/roles/${editorRole._id}`, {
                method: "PATCH",
                headers: await authHeaders(editor),
                body: {
                    permissions: [
                        "roles.read",
                        "roles.update",
                        "roles.manage",
                    ],
                },
            }),
            { params: { id: String(editorRole._id) } },
        );

        expect(res.status).toBe(403);
        const unchanged = await Role.findById(editorRole._id);
        expect(unchanged?.permissions).not.toContain("roles.manage");
    });

    it("chan roles.create tao role co permission khi khong co roles.manage", async () => {
        await Role.create({
            key: "role_creator",
            name: "Nguoi tao role",
            permissions: ["roles.read", "roles.create"],
            active: true,
        });
        const creator = await createTestUser({ roles: ["role_creator"] });

        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(creator),
                body: {
                    key: "privileged_role",
                    name: "Role co quyen cao",
                    permissions: ["roles.manage"],
                },
            }),
        );

        expect(res.status).toBe(403);
        expect(await Role.findOne({ key: "privileged_role" })).toBeNull();
    });
});

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
        await createTestUser({ roles: ["house_owner"] });

        const res = await listRolesRoute(
            makeRequest("/api/roles", { headers: await authHeaders(admin) }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        const houseOwnerRole = json.data.find((r: any) => r.key === "house_owner");
        expect(houseOwnerRole.assignedUserCount).toBe(1);
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
