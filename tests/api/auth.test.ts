import { describe, it, expect } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/zalo/login/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { makeRequest, readJson } from "../helpers";

describe("POST /api/auth/zalo/login", () => {
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
