import { describe, it, expect } from "vitest";
import {
    requireSession,
    requireRole,
    isAdmin,
    clusterScopeFilter,
} from "@/lib/rbac";
import { signSessionToken } from "@/lib/auth";
import { HttpError } from "@/lib/response";
import type { IUser } from "@/models/User";
import type { SessionTokenPayload } from "@/types";

function buildSession(
    overrides: Partial<SessionTokenPayload> = {},
): SessionTokenPayload {
    return {
        userId: "user-1",
        primaryRole: "resident",
        roles: ["resident"],
        sv: 0,
        ...overrides,
    };
}

function requestWithToken(session: SessionTokenPayload): Request {
    const token = signSessionToken(session);
    return new Request("http://localhost/api/test", {
        headers: { Authorization: `Bearer ${token}` },
    });
}

describe("requireSession", () => {
    it("nem loi 401 khi khong co header Authorization", () => {
        const req = new Request("http://localhost/api/test");
        expect(() => requireSession(req)).toThrow(HttpError);
        try {
            requireSession(req);
        } catch (err) {
            expect((err as HttpError).status).toBe(401);
        }
    });

    it("nem loi 401 khi token khong hop le", () => {
        const req = new Request("http://localhost/api/test", {
            headers: { Authorization: "Bearer invalid-token" },
        });
        expect(() => requireSession(req)).toThrow(HttpError);
    });

    it("tra ve session hop le khi token dung", () => {
        const session = buildSession({ userId: "abc123", roles: ["admin"] });
        const req = requestWithToken(session);
        const result = requireSession(req);
        expect(result.userId).toBe("abc123");
        expect(result.roles).toEqual(["admin"]);
    });
});

describe("requireRole", () => {
    it("khong nem loi khi session co mot trong cac vai tro cho phep", () => {
        const session = buildSession({ roles: ["neighborhood_leader"] });
        expect(() =>
            requireRole(session, "admin", "neighborhood_leader"),
        ).not.toThrow();
    });

    it("nem loi 403 khi session khong co vai tro nao duoc cho phep", () => {
        const session = buildSession({ roles: ["resident"] });
        expect(() => requireRole(session, "admin")).toThrow(HttpError);
        try {
            requireRole(session, "admin");
        } catch (err) {
            expect((err as HttpError).status).toBe(403);
        }
    });
});

describe("isAdmin", () => {
    it("tra ve true khi session co vai tro admin", () => {
        expect(isAdmin(buildSession({ roles: ["admin", "resident"] }))).toBe(
            true,
        );
    });

    it("tra ve false khi session khong co vai tro admin", () => {
        expect(isAdmin(buildSession({ roles: ["resident"] }))).toBe(false);
    });
});

describe("clusterScopeFilter", () => {
    it("tra ve dieu kien rong cho admin (xem toan bo)", () => {
        const admin = {
            roles: ["admin"],
            assignedClusters: ["Cụm 1"],
        } as unknown as IUser;
        expect(clusterScopeFilter(admin)).toEqual({});
    });

    it("tra ve dieu kien rong khi user khong duoc phan cong cum nao", () => {
        const leader = {
            roles: ["neighborhood_leader"],
            assignedClusters: [],
        } as unknown as IUser;
        expect(clusterScopeFilter(leader)).toEqual({});
    });

    it("loc theo assignedClusters cho vai tro khong phai admin", () => {
        const leader = {
            roles: ["neighborhood_leader"],
            assignedClusters: ["Cụm 1", "Cụm 2"],
        } as unknown as IUser;
        expect(clusterScopeFilter(leader)).toEqual({
            cluster: { $in: ["Cụm 1", "Cụm 2"] },
        });
    });

    it("cho phep tuy chinh ten truong loc", () => {
        const police = {
            roles: ["regional_police"],
            assignedClusters: ["Cụm 3"],
        } as unknown as IUser;
        expect(clusterScopeFilter(police, "householdCluster")).toEqual({
            householdCluster: { $in: ["Cụm 3"] },
        });
    });
});
