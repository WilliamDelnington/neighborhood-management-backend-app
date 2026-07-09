import { describe, it, expect } from "vitest";
import { GET as listUsersRoute } from "@/app/api/users/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("RBAC tren API - GET /api/users (chi admin)", () => {
    it("tu choi 401 khi khong dang nhap", async () => {
        const res = await listUsersRoute(makeRequest("/api/users"));
        expect(res.status).toBe(401);
    });

    it("tu choi 403 khi dang nhap nhung khong phai admin", async () => {
        const resident = await createTestUser({ roles: ["resident"] });
        const res = await listUsersRoute(
            makeRequest("/api/users", { headers: await authHeaders(resident) }),
        );
        expect(res.status).toBe(403);
    });

    it("cho phep admin xem danh sach nguoi dung", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const res = await listUsersRoute(
            makeRequest("/api/users", { headers: await authHeaders(admin) }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(Array.isArray(json.data.items)).toBe(true);
    });

    it("tu choi 403 cho vai tro nghiep vu khac (khong phai admin)", async () => {
        const police = await createTestUser({ roles: ["regional_police"] });
        const res = await listUsersRoute(
            makeRequest("/api/users", { headers: await authHeaders(police) }),
        );
        expect(res.status).toBe(403);
    });
});
