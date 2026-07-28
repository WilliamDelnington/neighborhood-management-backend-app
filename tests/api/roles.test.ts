import { describe, it, expect } from "vitest";
import { GET as listRolesRoute, POST as createRoleRoute } from "@/app/api/roles/route";
import {
    GET as getRoleRoute,
    PATCH as updateRoleRoute,
    DELETE as deleteRoleRoute,
} from "@/app/api/roles/[id]/route";
import { GET as permissionRegistryRoute } from "@/app/api/roles/permissions/route";
import { POST as assignRoleRoute } from "@/app/api/roles/assign/route";
import { POST as revokeRoleRoute } from "@/app/api/roles/revoke/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("GET /api/roles/permissions", () => {
    it("tu choi khi khong phai admin", async () => {
        const houseOwner = await createTestUser({ roles: ["house_owner"] });
        const res = await permissionRegistryRoute(
            makeRequest("/api/roles/permissions", {
                headers: await authHeaders(houseOwner),
            }),
        );
        expect(res.status).toBe(403);
    });

    it("tra ve danh muc quyen han theo module", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await permissionRegistryRoute(
            makeRequest("/api/roles/permissions", {
                headers: await authHeaders(admin),
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(Array.isArray(json.data)).toBe(true);
        const dashboardGroup = json.data.find((g: any) => g.key === "dashboard");
        expect(dashboardGroup.permissions).toContainEqual({
            key: "dashboard.read",
            label: "Xem bảng điều khiển",
        });
    });
});

describe("GET /api/roles (danh sach vai tro, tu dong seed 6 vai tro he thong)", () => {
    it("seed va tra ve du 6 vai tro he thong o lan goi dau tien", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await listRolesRoute(
            makeRequest("/api/roles?limit=50", {
                headers: await authHeaders(admin),
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        const keys = json.data.items.map((r: any) => r.key).sort();
        expect(keys).toEqual(
            [
                "admin",
                "neighborhood_leader",
                "people_committee_official",
                "regional_police",
                "house_owner",
                "secretary",
            ].sort(),
        );
        const adminRole = json.data.items.find((r: any) => r.key === "admin");
        expect(adminRole.system).toBe(true);
        expect(adminRole.assignedUserCount).toBeGreaterThanOrEqual(1);
    });
});

describe("POST /api/roles - tao vai tro tuy chinh", () => {
    it("tao thanh cong voi key va permissions hop le", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: {
                    key: "cluster_lead",
                    name: "Truong cum",
                    permissions: ["households.read", "citizens.read"],
                },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(201);
        expect(json.data.key).toBe("cluster_lead");
        expect(json.data.system).toBe(false);
        expect(json.data.permissions).toEqual([
            "households.read",
            "citizens.read",
        ]);
    });

    it("tu choi key da ton tai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { key: "dup_role", name: "A", permissions: [] },
            }),
        );
        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { key: "dup_role", name: "B", permissions: [] },
            }),
        );
        expect(res.status).toBe(409);
    });

    it("tu choi permission khong hop le", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: {
                    key: "bad_role",
                    name: "Bad",
                    permissions: ["not.a.real.permission"],
                },
            }),
        );
        expect(res.status).toBe(422);
    });
});

describe("PATCH/DELETE /api/roles/:id", () => {
    it("cap nhat permissions cua vai tro tuy chinh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const created = await readJson(
            await createRoleRoute(
                makeRequest("/api/roles", {
                    method: "POST",
                    headers: await authHeaders(admin),
                    body: {
                        key: "editable_role",
                        name: "Co the sua",
                        permissions: ["households.read"],
                    },
                }),
            ),
        );

        const res = await updateRoleRoute(
            makeRequest(`/api/roles/${created.data._id}`, {
                method: "PATCH",
                headers: await authHeaders(admin),
                body: { permissions: ["households.read", "citizens.read"] },
            }),
            { params: { id: created.data._id } },
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.permissions).toEqual([
            "households.read",
            "citizens.read",
        ]);
    });

    it("tu choi xoa vai tro he thong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        await listRolesRoute(
            makeRequest("/api/roles", { headers: await authHeaders(admin) }),
        );
        const roles = await readJson(
            await listRolesRoute(
                makeRequest("/api/roles?limit=50", {
                    headers: await authHeaders(admin),
                }),
            ),
        );
        const houseOwnerRole = roles.data.items.find(
            (r: any) => r.key === "house_owner",
        );
        const res = await deleteRoleRoute(
            makeRequest(`/api/roles/${houseOwnerRole._id}`, {
                method: "DELETE",
                headers: await authHeaders(admin),
            }),
            { params: { id: houseOwnerRole._id } },
        );
        expect(res.status).toBe(400);
    });

    it("tu choi xoa vai tro dang duoc gan cho nguoi dung", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const staff = await createTestUser({ roles: ["house_owner"] });
        const created = await readJson(
            await createRoleRoute(
                makeRequest("/api/roles", {
                    method: "POST",
                    headers: await authHeaders(admin),
                    body: {
                        key: "in_use_role",
                        name: "Dang duoc dung",
                        permissions: [],
                    },
                }),
            ),
        );
        await assignRoleRoute(
            makeRequest("/api/roles/assign", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { userId: String(staff._id), role: "in_use_role" },
            }),
        );

        const res = await deleteRoleRoute(
            makeRequest(`/api/roles/${created.data._id}`, {
                method: "DELETE",
                headers: await authHeaders(admin),
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(400);
    });

    it("cho phep xoa vai tro tuy chinh khong con ai su dung", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const created = await readJson(
            await createRoleRoute(
                makeRequest("/api/roles", {
                    method: "POST",
                    headers: await authHeaders(admin),
                    body: {
                        key: "unused_role",
                        name: "Khong ai dung",
                        permissions: [],
                    },
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
    });
});

describe("POST /api/roles/assign va /api/roles/revoke", () => {
    it("gan vai tro tuy chinh cho user va phan quyen co hieu luc ngay", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const staff = await createTestUser({ roles: ["house_owner"] });

        await createRoleRoute(
            makeRequest("/api/roles", {
                method: "POST",
                headers: await authHeaders(admin),
                body: {
                    key: "finance_viewer",
                    name: "Xem tai chinh",
                    permissions: ["dashboard.read", "finance.read"],
                },
            }),
        );

        const assignRes = await assignRoleRoute(
            makeRequest("/api/roles/assign", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { userId: String(staff._id), role: "finance_viewer" },
            }),
        );
        expect(assignRes.status).toBe(200);

        // Gan vai tro bump sessionVersion (buoc dang nhap lai), nen phai ky lai
        // token tu trang thai user moi nhat thay vi dung token cu truoc khi gan.
        const assignJson = await readJson(assignRes);
        const { User } = await import("@/models");
        const refreshedStaff = await User.findById(assignJson.data.user.id);
        const meRes = await meRoute(
            makeRequest("/api/auth/me", {
                headers: await authHeaders(refreshedStaff!),
            }),
        );
        const me = await readJson(meRes);
        expect(me.data.roles).toContain("finance_viewer");
        expect(me.data.permissions).toEqual(
            expect.arrayContaining(["dashboard.read", "finance.read"]),
        );
    });

    it("tu choi gan vai tro khong ton tai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const staff = await createTestUser({ roles: ["house_owner"] });
        const res = await assignRoleRoute(
            makeRequest("/api/roles/assign", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { userId: String(staff._id), role: "khong_ton_tai" },
            }),
        );
        expect(res.status).toBe(404);
    });

    it("thu hoi vai tro khoi user", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const staff = await createTestUser({
            roles: ["house_owner", "secretary"],
            primaryRole: "secretary",
        });

        const res = await revokeRoleRoute(
            makeRequest("/api/roles/revoke", {
                method: "POST",
                headers: await authHeaders(admin),
                body: { userId: String(staff._id), role: "secretary" },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.roles).not.toContain("secretary");
    });
});
