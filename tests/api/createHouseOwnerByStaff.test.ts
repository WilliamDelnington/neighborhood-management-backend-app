import { describe, it, expect } from "vitest";
import { POST as createUserRoute } from "@/app/api/users/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("To truong tao tai khoan chu ho thay (createHouseOwnerByStaff)", () => {
    it("neighborhood_leader tao duoc tai khoan chu ho khong can mat khau", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const headers = await authHeaders(leader);

        const createRes = await createUserRoute(
            makeRequest("/api/users", {
                method: "POST",
                headers,
                body: {
                    phone: "0901234567",
                    displayName: "Chu ho moi",
                },
            }),
        );
        const createJson = await readJson(createRes);
        expect(createRes.status).toBe(201);
        expect(createJson.data.roles).toContain("house_owner");
        expect(createJson.data.passwordHash).toBeUndefined();

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
                    displayName: "Trung so dien thoai",
                },
            }),
        );
        expect(res.status).toBe(409);
    });
});
