import { User, type IUser } from "@/models";
import type { Role } from "@/types";

let counter = 0;

/**
 * Tao mot User trong DB test voi vai tro chi dinh, dung cho cac bai test API/service
 * can mot "nguoi dung dang nhap" thuc su (co _id, sessionVersion...).
 */
export async function createTestUser(
    overrides: Partial<IUser> & { roles: Role[] },
): Promise<IUser> {
    counter += 1;
    const primaryRole = overrides.primaryRole || overrides.roles[0];
    return User.create({
        zaloUserId: `test-user-${counter}`,
        displayName: `Test User ${counter}`,
        status: "active",
        ...overrides,
        primaryRole,
    });
}

/**
 * Ky session token that cho user va tra ve header Authorization tuong ung,
 * dung de goi truc tiep cac route handler nhu mot request that.
 */
export async function authHeaders(
    user: IUser,
): Promise<Record<string, string>> {
    const { signSessionToken } = await import("@/lib/auth");
    const token = signSessionToken({
        userId: String(user._id),
        primaryRole: user.primaryRole,
        roles: user.roles,
        sv: user.sessionVersion,
    });
    return { Authorization: `Bearer ${token}` };
}

/**
 * Dung tao mot Request (Web Fetch API) de goi truc tiep cac route handler App Router
 * (GET/POST/... trong src/app/api/**\/route.ts) ma khong can khoi dong Next server that.
 */
export function makeRequest(
    url: string,
    options: {
        method?: string;
        body?: unknown;
        headers?: Record<string, string>;
    } = {},
): Request {
    const { method = "GET", body, headers = {} } = options;
    return new Request(`http://localhost${url}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
}

export async function readJson<T = any>(res: Response): Promise<T> {
    return res.json();
}
