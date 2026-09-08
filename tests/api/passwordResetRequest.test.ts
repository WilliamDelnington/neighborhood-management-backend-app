import { describe, it, expect } from "vitest";
import {
    GET as listRoute,
    POST as createRoute,
} from "@/app/api/password-reset-requests/route";
import { PATCH as updateStatusRoute } from "@/app/api/password-reset-requests/[id]/status/route";
import { PasswordResetRequest, User } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("POST /api/password-reset-requests (public, khong dang nhap)", () => {
    it("tao yeu cau thanh cong voi so dien thoai hop le", async () => {
        const res = await createRoute(
            makeRequest("/api/password-reset-requests", {
                method: "POST",
                body: { phone: "0912350001", note: "Quên mật khẩu" },
            }),
        );
        expect(res.status).toBe(201);

        const saved = await PasswordResetRequest.findOne({
            phone: "0912350001",
        });
        expect(saved).not.toBeNull();
        expect(saved!.status).toBe("moi");
        expect(saved!.note).toBe("Quên mật khẩu");
    });

    it("tu choi so dien thoai khong hop le", async () => {
        const res = await createRoute(
            makeRequest("/api/password-reset-requests", {
                method: "POST",
                body: { phone: "123" },
            }),
        );
        expect(res.status).toBe(422);
    });

    it("gioi han so lan gui trong 1 gio cho cung so dien thoai (429 tu lan thu 4)", async () => {
        const phone = "0912350002";
        for (let i = 0; i < 3; i += 1) {
            const res = await createRoute(
                makeRequest("/api/password-reset-requests", {
                    method: "POST",
                    body: { phone },
                }),
            );
            expect(res.status).toBe(201);
        }
        const blocked = await createRoute(
            makeRequest("/api/password-reset-requests", {
                method: "POST",
                body: { phone },
            }),
        );
        expect(blocked.status).toBe(429);
    });
});

describe("GET/PATCH /api/password-reset-requests - chi nguoi co users.reset_password", () => {
    it("tu choi nguoi dung khong co quyen users.reset_password", async () => {
        const staff = await createTestUser({ roles: ["secretary"] });
        const res = await listRoute(
            makeRequest("/api/password-reset-requests", {
                headers: await authHeaders(staff),
            }),
        );
        expect(res.status).toBe(403);
    });

    it("admin xem duoc danh sach, kem thong tin tai khoan khop so dien thoai (matchedUser)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const owner = await User.create({
            phone: "0912350003",
            displayName: "Chủ nhà A",
            roles: ["house_owner"],
            primaryRole: "house_owner",
            status: "active",
        });
        await createRoute(
            makeRequest("/api/password-reset-requests", {
                method: "POST",
                body: { phone: owner.phone },
            }),
        );

        const res = await listRoute(
            makeRequest("/api/password-reset-requests", {
                headers: await authHeaders(admin),
            }),
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        const item = json.data.items.find(
            (i: any) => i.phone === "0912350003",
        );
        expect(item).toBeDefined();
        expect(item.matchedUser._id).toBe(String(owner._id));
        expect(item.matchedUser.displayName).toBe("Chủ nhà A");
    });

    it("admin danh dau yeu cau da xu ly - resolvedByUserId/resolvedAt duoc ghi lai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        await createRoute(
            makeRequest("/api/password-reset-requests", {
                method: "POST",
                body: { phone: "0912350004" },
            }),
        );
        const request = await PasswordResetRequest.findOne({
            phone: "0912350004",
        });

        const res = await updateStatusRoute(
            makeRequest(
                `/api/password-reset-requests/${request!._id}/status`,
                {
                    method: "PATCH",
                    headers: await authHeaders(admin),
                    body: { status: "da_xu_ly" },
                },
            ),
            { params: { id: String(request!._id) } },
        );
        expect(res.status).toBe(200);

        const updated = await PasswordResetRequest.findById(request!._id);
        expect(updated!.status).toBe("da_xu_ly");
        expect(String(updated!.resolvedByUserId)).toBe(String(admin._id));
        expect(updated!.resolvedAt).toBeInstanceOf(Date);
    });
});
