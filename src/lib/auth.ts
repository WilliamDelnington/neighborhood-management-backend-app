import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { SessionTokenPayload } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

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
