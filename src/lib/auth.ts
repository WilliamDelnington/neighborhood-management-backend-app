import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import type { SessionTokenPayload, UploadTokenPayload } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "180d";
// Rieng cho upload token (xem UploadTokenPayload) - ngan han vi chi dung mot
// lan cho luong openMediaPicker cua Zalo, khong phai phien dang nhap.
const UPLOAD_TOKEN_EXPIRES_IN = "10m";

if (!JWT_SECRET) {
    throw new Error("Thieu bien moi truong JWT_SECRET");
}

export function signSessionToken(payload: SessionTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as SessionTokenPayload;
    } catch {
        return null;
    }
}

export function signUploadToken(payload: UploadTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: UPLOAD_TOKEN_EXPIRES_IN,
    } as jwt.SignOptions);
}

export function verifyUploadToken(token: string): UploadTokenPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as UploadTokenPayload;
        // Phan biet voi SessionTokenPayload (ca hai deu ky bang cung
        // JWT_SECRET) - token session khong co truong `purpose`.
        if (decoded.purpose !== "upload") return null;
        return decoded;
    } catch {
        return null;
    }
}

export function getBearerToken(req: Request): string | null {
    const header =
        req.headers.get("authorization") || req.headers.get("Authorization");
    if (!header || !header.startsWith("Bearer ")) return null;
    return header.slice("Bearer ".length).trim();
}

export function getSessionFromRequest(
    req: Request,
): SessionTokenPayload | null {
    const token = getBearerToken(req);
    if (!token) return null;
    return verifySessionToken(token);
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export async function comparePassword(
    password: string,
    hash: string,
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// Bo ky tu de nham lan khi doc qua dien thoai (0/O, 1/l/I) - dung cho mat khau
// tam sinh tu dong khi to truong/nhan vien bam "Dat lai mat khau" (xem
// passwordResetRequestService.resetPasswordForRequest). Nguoi dung bi bat doi
// mat khau ngay lan dang nhap ke tiep (User.mustChangePassword) nen day chi
// can du an toan de dung tam thoi, khong can nguoi dung tu nho lau dai.
const RANDOM_PASSWORD_CHARS =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateRandomPassword(length = 8): string {
    let result = "";
    for (let i = 0; i < length; i++) {
        result += RANDOM_PASSWORD_CHARS[randomInt(RANDOM_PASSWORD_CHARS.length)];
    }
    return result;
}
