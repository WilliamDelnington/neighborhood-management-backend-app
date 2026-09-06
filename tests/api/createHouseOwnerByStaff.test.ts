import { describe, it, expect } from "vitest";
import { POST as createUserRoute } from "@/app/api/users/route";
import { GET as creatableRolesRoute } from "@/app/api/users/creatable-roles/route";
import { Role as RoleModel } from "@/models";
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

    it("vai tro voi allowedCreatableRoles duoc tao tai khoan vai tro do, vai tro khac ngoai danh sach bi tu choi", async () => {
        await RoleModel.create({
            key: "social_cultral_leader",
            name: "Tổ trưởng an sinh xã hội",
            permissions: [],
            system: false,
            active: true,
        });
        // createTestUser dam bao Role doc "neighborhood_leader" ton tai
        // (ensureSystemRoleDocs, upsert) - phai tao user TRUOC roi moi
        // findOneAndUpdate, neu khong update se khong khop duoc doc nao.
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        await RoleModel.findOneAndUpdate(
            { key: "neighborhood_leader" },
            { allowedCreatableRoles: ["social_cultral_leader"] },
        );
        const headers = await authHeaders(leader);

        const okRes = await createUserRoute(
            makeRequest("/api/users", {
                method: "POST",
                headers,
                body: {
                    phone: "0911111111",
                    displayName: "Vai tro tuy chinh",
                    idNumber: "001111111111",
                    role: "social_cultral_leader",
                },
            }),
        );
        expect(okRes.status).toBe(201);

        const rejectedRes = await createUserRoute(
            makeRequest("/api/users", {
                method: "POST",
                headers,
                body: {
                    phone: "0911111112",
                    displayName: "Vai tro khong duoc phep",
                    idNumber: "001111111112",
                    role: "neighborhood_coleader",
                },
            }),
        );
        expect(rejectedRes.status).toBe(403);
    });

    it("khong the tao tai khoan voi vai tro trong ACCOUNT_CREATION_RESERVED_ROLE_KEYS du duoc liet ke trong allowedCreatableRoles", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        await RoleModel.findOneAndUpdate(
            { key: "neighborhood_leader" },
            { allowedCreatableRoles: ["secretary"] },
        );
        const headers = await authHeaders(leader);

        const res = await createUserRoute(
            makeRequest("/api/users", {
                method: "POST",
                headers,
                body: {
                    phone: "0911111113",
                    displayName: "Bi thu khong hop le",
                    idNumber: "001111111113",
                    role: "secretary",
                },
            }),
        );
        expect(res.status).toBe(403);
    });

    it("admin luon tao duoc bat ky vai tro active nao (tru cac vai tro reserved), khong can allowedCreatableRoles", async () => {
        await RoleModel.create({
            key: "social_cultral_leader",
            name: "Tổ trưởng an sinh xã hội",
            permissions: [],
            system: false,
            active: true,
        });
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);

        const res = await createUserRoute(
            makeRequest("/api/users", {
                method: "POST",
                headers,
                body: {
                    phone: "0911111114",
                    displayName: "Admin tao vai tro tuy chinh",
                    idNumber: "001111111114",
                    role: "social_cultral_leader",
                },
            }),
        );
        expect(res.status).toBe(201);
    });

    it("GET /api/users/creatable-roles tra ve dung danh sach theo vai tro cua actor", async () => {
        await RoleModel.create({
            key: "social_cultral_leader",
            name: "Tổ trưởng an sinh xã hội",
            permissions: [],
            system: false,
            active: true,
        });
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        await RoleModel.findOneAndUpdate(
            { key: "neighborhood_leader" },
            { allowedCreatableRoles: ["social_cultral_leader"] },
        );
        const headers = await authHeaders(leader);

        const res = await creatableRolesRoute(
            makeRequest("/api/users/creatable-roles", { headers }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        const keys = json.data.map((r: any) => r.key).sort();
        expect(keys).toEqual(["house_owner", "social_cultral_leader"]);
    });
});
