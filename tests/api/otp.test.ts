import { describe, it, expect, afterEach } from "vitest";
import { POST as otpRequestRoute } from "@/app/api/auth/otp/request/route";
import { POST as otpVerifyRoute } from "@/app/api/auth/otp/verify/route";
import { POST as passwordLoginRoute } from "@/app/api/auth/login/route";
import { requestOtp } from "@/services/otpService";
import { OtpChallenge } from "@/models";
import { makeRequest, readJson } from "../helpers";

afterEach(() => {
    delete process.env.AUTH_OTP_ENABLED;
});

describe("OTP: cong tac AUTH_OTP_ENABLED", () => {
    it("mac dinh (khong bat) ca hai route OTP tra ve 404, khong dung DB", async () => {
        delete process.env.AUTH_OTP_ENABLED;

        const reqRes = await otpRequestRoute(
            makeRequest("/api/auth/otp/request", {
                method: "POST",
                body: { phone: "0912340001", purpose: "register" },
            }),
        );
        expect(reqRes.status).toBe(404);

        const verifyRes = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: {
                    phone: "0912340001",
                    purpose: "register",
                    code: "123456",
                },
            }),
        );
        expect(verifyRes.status).toBe(404);
    });

    it("dang nhap bang mat khau van hoat dong binh thuong du OTP bat hay tat", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const res = await passwordLoginRoute(
            makeRequest("/api/auth/login", {
                method: "POST",
                body: { phone: "0912340099", password: "wrongpass" },
            }),
        );
        // Tai khoan khong ton tai -> 401 nhu binh thuong, khong bi anh huong boi
        // cong tac OTP (hai co che song song, doc lap).
        expect(res.status).toBe(401);
    });
});

describe("OTP: luong dang ky/dang nhap khi AUTH_OTP_ENABLED=true", () => {
    it("dang ky bang OTP: xac thuc dung ma tao tai khoan moi va tra ve token, khong lo passwordHash/ma OTP", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340011";
        const { code } = await requestOtp(phone, "register");
        expect(code).toMatch(/^\d{6}$/);

        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: {
                    phone,
                    purpose: "register",
                    code,
                    displayName: "Người dùng OTP",
                },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.token).toBeTypeOf("string");
        expect(json.data.user.phone).toBe(phone);
        expect(json.data.user.displayName).toBe("Người dùng OTP");
        expect(json.data.user.passwordHash).toBeUndefined();
        expect(json.data.user.code).toBeUndefined();
        expect(json.data.user.codeHash).toBeUndefined();
    });

    it("dang ky lai bang OTP cho so da co tai khoan bi tu choi (409), va requestOtp khong tao challenge moi (chong do tim tai khoan)", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340012";
        const first = await requestOtp(phone, "register");
        await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, purpose: "register", code: first.code },
            }),
        );

        const second = await requestOtp(phone, "register");
        expect(second.code).toBe("");
    });

    it("dang nhap bang OTP cho so chua co tai khoan: requestOtp khong tao challenge (chong do tim tai khoan), verify bao loi chung", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340013";
        const { code } = await requestOtp(phone, "login");
        expect(code).toBe("");

        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, purpose: "login", code: "000000" },
            }),
        );
        expect(res.status).toBe(401);
    });

    it("dang nhap bang OTP cho tai khoan da co: xac thuc dung ma thanh cong", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340014";
        const registerCode = (await requestOtp(phone, "register")).code;
        await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, purpose: "register", code: registerCode },
            }),
        );

        const loginCode = (await requestOtp(phone, "login")).code;
        expect(loginCode).toMatch(/^\d{6}$/);
        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, purpose: "login", code: loginCode },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.user.phone).toBe(phone);
    });

    it("ma OTP sai bi tu choi (401) va tang dan attempts tren chinh ban ghi challenge", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340015";
        await requestOtp(phone, "register");

        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, purpose: "register", code: "000000" },
            }),
        );
        expect(res.status).toBe(401);

        const challenge = await OtpChallenge.findOne({ purpose: "register" }).sort({
            createdAt: -1,
        });
        expect(challenge!.attempts).toBe(1);
    });

    it("vuot qua so lan thu toi da tren mot challenge -> 429 ke ca lan sau nhap dung ma", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340016";
        const { code } = await requestOtp(phone, "register");

        for (let i = 0; i < 5; i += 1) {
            const res = await otpVerifyRoute(
                makeRequest("/api/auth/otp/verify", {
                    method: "POST",
                    body: { phone, purpose: "register", code: "000000" },
                }),
            );
            expect(res.status).toBe(401);
        }

        const blockedRes = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, purpose: "register", code },
            }),
        );
        expect(blockedRes.status).toBe(429);
    });

    it("ma OTP het han bi tu choi", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340017";
        const { code } = await requestOtp(phone, "register");
        await OtpChallenge.updateMany(
            { purpose: "register" },
            { $set: { expiresAt: new Date(Date.now() - 1000) } },
        );

        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, purpose: "register", code },
            }),
        );
        expect(res.status).toBe(401);
    });
});
