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
                body: { phone: "0912340001" },
            }),
        );
        expect(reqRes.status).toBe(404);

        const verifyRes = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone: "0912340001", code: "123456" },
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

describe("OTP: luong thong nhat khi AUTH_OTP_ENABLED=true (server tu quyet dinh dang nhap/dang ky, client khong gui purpose)", () => {
    it("so chua co tai khoan: requestOtp LUON tao challenge + tra ve ma thuc (khong con im lang nhu truoc), verify tao tai khoan moi", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340011";
        const { code } = await requestOtp(phone);
        expect(code).toMatch(/^\d{6}$/);

        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, code, displayName: "Người dùng OTP" },
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

    it("sau khi da co tai khoan, requestOtp cho cung so tu dong chuyen sang dang nhap (khong the dang ky trung)", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340012";
        const first = await requestOtp(phone);
        await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, code: first.code },
            }),
        );

        const second = await requestOtp(phone);
        expect(second.code).toMatch(/^\d{6}$/);
        const challenge = await OtpChallenge.findOne({}).sort({
            createdAt: -1,
        });
        expect(challenge!.purpose).toBe("login");
    });

    it("so chua co tai khoan nhung nguoi dung bam 'dang nhap': van tu dong dang ky thanh cong (khong con bi im lang tu choi)", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340013";
        const { code } = await requestOtp(phone);
        expect(code).toMatch(/^\d{6}$/);

        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, code },
            }),
        );
        expect(res.status).toBe(200);
    });

    it("dang nhap bang OTP cho tai khoan da co: xac thuc dung ma thanh cong", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340014";
        const registerCode = (await requestOtp(phone)).code;
        await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, code: registerCode },
            }),
        );

        const loginCode = (await requestOtp(phone)).code;
        expect(loginCode).toMatch(/^\d{6}$/);
        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, code: loginCode },
            }),
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.user.phone).toBe(phone);
    });

    it("ma OTP sai bi tu choi (401) va tang dan attempts tren chinh ban ghi challenge", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340015";
        await requestOtp(phone);

        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, code: "000000" },
            }),
        );
        expect(res.status).toBe(401);

        const challenge = await OtpChallenge.findOne({}).sort({
            createdAt: -1,
        });
        expect(challenge!.attempts).toBe(1);
    });

    it("vuot qua so lan thu toi da tren mot challenge -> 429 ke ca lan sau nhap dung ma", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340016";
        const { code } = await requestOtp(phone);

        for (let i = 0; i < 5; i += 1) {
            const res = await otpVerifyRoute(
                makeRequest("/api/auth/otp/verify", {
                    method: "POST",
                    body: { phone, code: "000000" },
                }),
            );
            expect(res.status).toBe(401);
        }

        const blockedRes = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, code },
            }),
        );
        expect(blockedRes.status).toBe(429);
    });

    it("ma OTP het han bi tu choi", async () => {
        process.env.AUTH_OTP_ENABLED = "true";
        const phone = "0912340017";
        const { code } = await requestOtp(phone);
        await OtpChallenge.updateMany(
            {},
            { $set: { expiresAt: new Date(Date.now() - 1000) } },
        );

        const res = await otpVerifyRoute(
            makeRequest("/api/auth/otp/verify", {
                method: "POST",
                body: { phone, code },
            }),
        );
        expect(res.status).toBe(401);
    });
});
