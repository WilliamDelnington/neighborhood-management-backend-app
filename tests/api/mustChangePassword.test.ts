import { describe, it, expect } from "vitest";
import {
    POST as createHouseRoute,
    GET as listHousesRoute,
} from "@/app/api/houses/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as setPasswordRoute } from "@/app/api/auth/set-password/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { User } from "@/models";
import { resetUserPasswordByAdmin } from "@/services/userService";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

/**
 * Kiem tra "mustChangePassword" - tai khoan co mat khau do NGUOI KHAC dat
 * thay (import Excel, tao nha kem chu nha, admin dat lai mat khau) phai bi
 * chan moi API khac ngoai set-password/me/logout (rbac.ts requireUser) cho
 * toi khi tu doi mat khau qua authService.setPassword.
 */

describe("mustChangePassword - tài khoản có mật khẩu do người khác đặt", () => {
    it("tạo nhà kèm chủ nhà + mật khẩu: tài khoản bị chặn API khác, đăng nhập/set-password/me/logout vẫn dùng được, tự đổi mật khẩu xong thì hết bị chặn", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const createRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: adminHeaders,
                body: {
                    cluster: "Cụm test mustChangePassword",
                    address: "Số 1, Cụm test",
                    ownerKind: "individual",
                    createOwnerAccount: true,
                    owner: {
                        displayName: "Chủ Nhà Test",
                        phone: "0977000111",
                        password: "TempPass123",
                    },
                },
            }),
        );
        expect(createRes.status).toBe(201);

        const ownerUser = await User.findOne({ phone: "0977000111" });
        expect(ownerUser).not.toBeNull();
        expect(ownerUser!.mustChangePassword).toBe(true);

        const loginRes = await loginRoute(
            makeRequest("/api/auth/login", {
                method: "POST",
                body: { phone: "0977000111", password: "TempPass123" },
            }),
        );
        expect(loginRes.status).toBe(200);
        const loginJson = await readJson(loginRes);
        expect(loginJson.data.user.mustChangePassword).toBe(true);
        const ownerHeaders = { Authorization: `Bearer ${loginJson.data.token}` };

        // Bi chan boi mot API khac (khong nam trong danh sach cho phep).
        const blockedRes = await listHousesRoute(
            makeRequest("/api/houses", { headers: ownerHeaders }),
        );
        expect(blockedRes.status).toBe(423);

        // /api/auth/me van dung duoc.
        const meRes = await meRoute(
            makeRequest("/api/auth/me", { headers: ownerHeaders }),
        );
        expect(meRes.status).toBe(200);

        // Chua nhap mat khau hien tai -> bao loi ro rang (khong phai 423).
        const missingCurrentRes = await setPasswordRoute(
            makeRequest("/api/auth/set-password", {
                method: "POST",
                headers: ownerHeaders,
                body: { password: "NewPass123" },
            }),
        );
        expect(missingCurrentRes.status).toBe(400);

        // Tu doi mat khau thanh cong.
        const setPasswordRes = await setPasswordRoute(
            makeRequest("/api/auth/set-password", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    currentPassword: "TempPass123",
                    password: "NewPass123",
                },
            }),
        );
        expect(setPasswordRes.status).toBe(200);
        const setPasswordJson = await readJson(setPasswordRes);
        expect(setPasswordJson.data.mustChangePassword).toBe(false);

        // Khong con bi chan nua - dung CUNG token (setPassword khong doi
        // sessionVersion/token).
        const unblockedRes = await listHousesRoute(
            makeRequest("/api/houses", { headers: ownerHeaders }),
        );
        expect(unblockedRes.status).not.toBe(423);

        // Dang xuat van dung duoc du con bi chan (da kiem tra o tren, nhung
        // xac nhan lai voi tai khoan da doi mat khau xong).
        const logoutRes = await logoutRoute(
            makeRequest("/api/auth/logout", {
                method: "POST",
                headers: ownerHeaders,
            }),
        );
        expect(logoutRes.status).toBe(200);
    });

    it("admin đặt lại mật khẩu cho tài khoản đã tồn tại: cũng bật mustChangePassword", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const owner = await createTestUser({ roles: ["house_owner"] });
        expect(owner.mustChangePassword).toBe(false);

        await resetUserPasswordByAdmin(admin, String(owner._id), {
            password: "ResetPass123",
        });

        const refreshed = await User.findById(owner._id);
        expect(refreshed!.mustChangePassword).toBe(true);
    });

    it("tạo nhà kèm chủ nhà KHÔNG có mật khẩu: không bật mustChangePassword (tài khoản chưa đăng nhập được)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: adminHeaders,
                body: {
                    cluster: "Cụm test không mật khẩu",
                    address: "Số 2, Cụm test",
                    ownerKind: "individual",
                    createOwnerAccount: true,
                    owner: {
                        displayName: "Chủ Nhà Không Mật Khẩu",
                        phone: "0977000222",
                    },
                },
            }),
        );

        const ownerUser = await User.findOne({ phone: "0977000222" }).select(
            "+passwordHash",
        );
        expect(ownerUser).not.toBeNull();
        expect(ownerUser!.passwordHash).toBeUndefined();
        expect(ownerUser!.mustChangePassword).toBe(false);
    });
});
