import { describe, it, expect } from "vitest";
import { POST as createUserRoute } from "@/app/api/users/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("To truong tao tai khoan chu ho thay (createHouseOwnerByStaff)", () => {
    it("neighborhood_leader tao duoc tai khoan chu ho, va tai khoan do dang nhap duoc bang phone+password da dat", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const headers = await authHeaders(leader);

        const createRes = await createUserRoute(
            makeRequest("/api/users", {
                method: "POST",
                headers,
                body: {
                    phone: "0901234567",
                    password: "matkhau123",
                    displayName: "Chu ho moi",
                },
            }),
        );
        const createJson = await readJson(createRes);
        expect(createRes.status).toBe(201);
        expect(createJson.data.roles).toContain("house_owner");
        expect(createJson.data.passwordHash).toBeUndefined();

        const loginRes = await loginRoute(
            makeRequest("/api/auth/login", {
                method: "POST",
                body: { phone: "0901234567", password: "matkhau123" },
            }),
        );
        const loginJson = await readJson(loginRes);
        expect(loginRes.status).toBe(200);
        expect(loginJson.data.token).toBeTruthy();
        expect(loginJson.data.user.id).toBe(createJson.data.id);
    });

    it("house_owner (khong phai nhan vien) khong duoc tao tai khoan chu ho khac", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const headers = await authHeaders(owner);

        const res = await createUserRoute(
            makeRequest("/api/users", {
                method: "POST",
                headers,
                body: {
                    phone: "0907654321",
                    password: "matkhau123",
                    displayName: "Chu ho khac",
                },
            }),
        );
        expect(res.status).toBe(403);
    });

    it("tu choi tao tai khoan neu so dien thoai da duoc su dung", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const headers = await authHeaders(leader);
        await createTestUser({ roles: ["house_owner"], phone: "0909998888" });

        const res = await createUserRoute(
            makeRequest("/api/users", {
                method: "POST",
                headers,
                body: {
                    phone: "0909998888",
                    password: "matkhau123",
                    displayName: "Trung so dien thoai",
                },
            }),
        );
        expect(res.status).toBe(409);
    });
});
