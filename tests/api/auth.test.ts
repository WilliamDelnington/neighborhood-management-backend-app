import { describe, it, expect } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/zalo/login/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { createTestUser, makeRequest, readJson } from "../helpers";

describe("POST /api/auth/zalo/login", () => {
    it("lien ket Zalo vao tai khoan tao truoc khi so dien thoai da duoc xac thuc", async () => {
        const existing = await createTestUser({
            roles: ["house_owner"],
            phone: "0901112233",
            zaloUserId: undefined,
            displayName: "Chu ho tao truoc",
        });
        const result = await readJson(
            await loginRoute(
                makeRequest("/api/auth/zalo/login", {
                    method: "POST",
                    body: {
                        accessToken: "sandbox-link-token",
                        zaloUserId: "zalo-linked-owner",
                        phone: "0901112233",
                        name: "Ten Zalo",
                    },
                }),
            ),
        );

        expect(result.data.user.id).toBe(String(existing._id));
        expect(result.data.user.zaloUserId).toBe("zalo-linked-owner");
    });

    it("tao tai khoan houseOwner moi va tra ve session token khi lan dau dang nhap", async () => {
        const res = await loginRoute(
            makeRequest("/api/auth/zalo/login", {
                method: "POST",
                body: {
                    accessToken: "sandbox-token",
                    zaloUserId: "zalo-new-user",
                    name: "Nguyễn Test",
                },
            }),
        );
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data.token).toBeTypeOf("string");
        expect(json.data.user.primaryRole).toBe("house_owner");
        expect(json.data.user.displayName).toBe("Nguyễn Test");
    });

    it("dang nhap lai voi cung zaloUserId se tra ve cung mot tai khoan", async () => {
        const first = await readJson(
            await loginRoute(
                makeRequest("/api/auth/zalo/login", {
                    method: "POST",
                    body: {
                        accessToken: "t1",
                        zaloUserId: "zalo-repeat-user",
                        name: "Lần 1",
                    },
                }),
            ),
        );
        const second = await readJson(
            await loginRoute(
                makeRequest("/api/auth/zalo/login", {
                    method: "POST",
                    body: {
                        accessToken: "t2",
                        zaloUserId: "zalo-repeat-user",
                        name: "Lần 2",
                    },
                }),
            ),
        );

        expect(second.data.user.id).toBe(first.data.user.id);
        expect(second.data.user.displayName).toBe("Lần 2");
    });

    it("tu choi khi thieu accessToken", async () => {
        const res = await loginRoute(
            makeRequest("/api/auth/zalo/login", {
                method: "POST",
                body: { accessToken: "", zaloUserId: "zalo-x" },
            }),
        );
        expect(res.status).toBe(422);
    });

    it("GET /api/auth/me tra ve 401 khi khong co token", async () => {
        const res = await meRoute(makeRequest("/api/auth/me"));
        expect(res.status).toBe(401);
    });

    it("GET /api/auth/me tra ve thong tin nguoi dung khi token hop le", async () => {
        const loginRes = await readJson(
            await loginRoute(
                makeRequest("/api/auth/zalo/login", {
                    method: "POST",
                    body: {
                        accessToken: "t3",
                        zaloUserId: "zalo-me-user",
                        name: "Người Test",
                    },
                }),
            ),
        );
        const res = await meRoute(
            makeRequest("/api/auth/me", {
                headers: { Authorization: `Bearer ${loginRes.data.token}` },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.displayName).toBe("Người Test");
    });
});

describe("GET /api/auth/me - missingScopeAssignments", () => {
    const getMe = async (user: Awaited<ReturnType<typeof createTestUser>>) => {
        const { authHeaders } = await import("../helpers");
        const json = await readJson(
            await meRoute(
                makeRequest("/api/auth/me", { headers: await authHeaders(user) }),
            ),
        );
        return json.data.missingScopeAssignments as {
            roleKey: string;
            scopeType: string;
        }[];
    };

    it("liet ke moi vai tro cap Phuong chua duoc gan wardCode", async () => {
        const user = await createTestUser({
            roles: ["people_committee_official", "regional_police"],
        });
        const missing = await getMe(user);
        expect(missing.map(m => m.roleKey).sort()).toEqual([
            "people_committee_official",
            "regional_police",
        ]);
        expect(missing.every(m => m.scopeType === "WARD")).toBe(true);
    });

    it("rong khi vai tro cap Phuong da duoc gan wardCode", async () => {
        const user = await createTestUser({
            roles: ["secretary"],
            wardCode: 10001,
        });
        expect(await getMe(user)).toEqual([]);
    });

    it("liet ke vai tro cap To dan pho chua duoc gan to dan pho nao", async () => {
        const user = await createTestUser({
            roles: ["neighborhood_coleader"],
        });
        const missing = await getMe(user);
        expect(missing).toHaveLength(1);
        expect(missing[0]).toMatchObject({
            roleKey: "neighborhood_coleader",
            scopeType: "NEIGHBORHOOD",
        });
    });

    it("khong chan admin hay vai tro OWNED (chu nha)", async () => {
        const admin = await createTestUser({
            roles: ["admin", "people_committee_official"],
        });
        const owner = await createTestUser({ roles: ["house_owner"] });
        expect(await getMe(admin)).toEqual([]);
        expect(await getMe(owner)).toEqual([]);
    });
});
