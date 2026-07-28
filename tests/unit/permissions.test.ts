import { describe, it, expect } from "vitest";
import {
    getUserPermissionSet,
    userHasPermission,
    requirePermission,
    requireAnyPermission,
    requireAllPermissions,
} from "@/lib/rbac";
import { HttpError } from "@/lib/response";
import { Role, User, type IUser } from "@/models";

async function makeUser(overrides: Partial<IUser> & { roles: string[] }) {
    return User.create({
        zaloUserId: `perm-test-${Math.random()}`,
        displayName: "Permission Test User",
        status: "active",
        primaryRole: overrides.roles[0],
        ...overrides,
    });
}

describe("getUserPermissionSet / userHasPermission", () => {
    it("cap permission tu role dang active co chua permission do", async () => {
        await Role.create({
            key: "custom_reader",
            name: "Custom reader",
            permissions: ["complaints.read"],
            active: true,
        });
        const user = await makeUser({ roles: ["custom_reader"] });

        expect(await userHasPermission(user, "complaints.read")).toBe(true);
        expect(await userHasPermission(user, "complaints.delete")).toBe(false);
    });

    it("role bi vo hieu hoa (active:false) khong cap permission nao", async () => {
        await Role.create({
            key: "disabled_role",
            name: "Disabled",
            permissions: ["complaints.read"],
            active: false,
        });
        const user = await makeUser({ roles: ["disabled_role"] });

        expect(await userHasPermission(user, "complaints.read")).toBe(false);
    });

    it("permission rieng cua user (override) van co hieu luc du role khong co", async () => {
        await Role.create({
            key: "bare_role",
            name: "Bare",
            permissions: [],
            active: true,
        });
        const user = await makeUser({
            roles: ["bare_role"],
            permissions: ["complaints.read"],
        });

        expect(await userHasPermission(user, "complaints.read")).toBe(true);
    });

    it("role key khong ton tai thi khong cap permission va tu tao placeholder inactive", async () => {
        const user = await makeUser({ roles: ["ghost_role"] });

        const permissions = await getUserPermissionSet(user);
        expect(permissions.size).toBe(0);

        const placeholder = await Role.findOne({ key: "ghost_role" });
        expect(placeholder).not.toBeNull();
        expect(placeholder!.active).toBe(false);
        expect(placeholder!.system).toBe(false);
    });
});

describe("requirePermission / requireAnyPermission / requireAllPermissions", () => {
    it("requirePermission nem HttpError 403 khi thieu quyen", async () => {
        const user = await makeUser({ roles: ["house_owner"] });
        await expect(requirePermission(user, "finance.read")).rejects.toThrow(
            HttpError,
        );
    });

    it("requireAnyPermission qua khi co it nhat mot quyen phu hop", async () => {
        await Role.create({
            key: "mixed_role",
            name: "Mixed",
            permissions: ["complaints.read"],
            active: true,
        });
        const user = await makeUser({ roles: ["mixed_role"] });

        await expect(
            requireAnyPermission(user, ["finance.read", "complaints.read"]),
        ).resolves.not.toThrow();
    });

    it("requireAllPermissions nem loi khi thieu mot trong cac quyen yeu cau", async () => {
        await Role.create({
            key: "partial_role",
            name: "Partial",
            permissions: ["complaints.read"],
            active: true,
        });
        const user = await makeUser({ roles: ["partial_role"] });

        await expect(
            requireAllPermissions(user, ["complaints.read", "complaints.delete"]),
        ).rejects.toThrow(HttpError);
    });
});
