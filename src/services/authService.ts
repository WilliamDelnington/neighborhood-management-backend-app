import { User, type IUser } from "@/models";
import { signSessionToken, comparePassword, hashPassword } from "@/lib/auth";
import {
    permissionsForRoles,
    allowedComplaintCategoriesForRoles,
    roleLabelMap,
} from "@/lib/rbac";
import { verifyZaloAccessToken } from "@/lib/zalo";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    ZaloLoginInput,
    PhoneLoginInput,
    SetPasswordInput,
    UpdateProfileInput,
} from "@/validators/auth";

export async function loginWithZalo(input: ZaloLoginInput) {
    const profile = await verifyZaloAccessToken(
        input.accessToken,
        input.zaloUserId,
        {
            name: input.name,
            avatarUrl: input.avatarUrl,
        },
    );

    let user = await User.findOne({ zaloUserId: profile.zaloUserId });

    if (!user) {
        user = await User.create({
            zaloUserId: profile.zaloUserId,
            displayName: profile.name || input.name || "Người dùng Zalo",
            avatarUrl: profile.avatarUrl || input.avatarUrl,
            phone: input.phone,
            roles: ["resident"],
            primaryRole: "resident",
            status: "active",
        });
    } else {
        user.lastLoginAt = new Date();
        if (profile.name) user.displayName = profile.name;
        if (profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
        await user.save();
    }

    const token = signSessionToken({
        userId: String(user._id),
        primaryRole: user.primaryRole,
        roles: user.roles,
        sv: user.sessionVersion,
    });

    await writeAuditLog({
        actorId: user._id,
        action:
            profile.verifiedVia === "sandbox"
                ? "auth.login.sandbox"
                : "auth.login",
        targetModel: "User",
        targetId: user._id,
    });

    return { token, user: await sanitizeUser(user) };
}

export async function loginWithPhone(input: PhoneLoginInput) {
    const user = await User.findOne({ phone: input.phone }).select(
        "+passwordHash",
    );
    if (!user || !user.passwordHash) {
        throw new HttpError("So dien thoai hoac mat khau khong dung", 401);
    }
    if (user.status === "locked") {
        throw new HttpError("Tai khoan da bi khoa", 401);
    }

    const valid = await comparePassword(input.password, user.passwordHash);
    if (!valid) {
        throw new HttpError("So dien thoai hoac mat khau khong dung", 401);
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signSessionToken({
        userId: String(user._id),
        primaryRole: user.primaryRole,
        roles: user.roles,
        sv: user.sessionVersion,
    });

    await writeAuditLog({
        actorId: user._id,
        action: "auth.login",
        targetModel: "User",
        targetId: user._id,
    });

    return { token, user: await sanitizeUser(user) };
}

/**
 * Neu tai khoan da co mat khau, bat buoc xac thuc currentPassword truoc khi doi.
 * Neu chua co (vd. tai khoan can bo moi tao, chi co phone), cho phep dat lan dau.
 */
export async function setPassword(userId: string, input: SetPasswordInput) {
    const user = await User.findById(userId).select("+passwordHash");
    if (!user) throw new HttpError("Khong tim thay tai khoan", 404);

    if (user.passwordHash) {
        if (!input.currentPassword) {
            throw new HttpError("Thieu mat khau hien tai", 400);
        }
        const valid = await comparePassword(
            input.currentPassword,
            user.passwordHash,
        );
        if (!valid) {
            throw new HttpError("Mat khau hien tai khong dung", 401);
        }
    }

    user.passwordHash = await hashPassword(input.password);
    await user.save();

    await writeAuditLog({
        actorId: user._id,
        action: "auth.set-password",
        targetModel: "User",
        targetId: user._id,
    });

    return await sanitizeUser(user);
}

export async function updateOwnProfile(
    userId: string,
    input: UpdateProfileInput,
) {
    const user = await User.findById(userId);
    if (!user) throw new Error("Khong tim thay tai khoan");
    if (input.displayName !== undefined) user.displayName = input.displayName;
    if (input.phone !== undefined) user.phone = input.phone;
    if (input.address !== undefined) user.address = input.address;
    if (input.notificationPermission !== undefined) {
        user.notificationPermission = input.notificationPermission;
    }
    await user.save();
    return await sanitizeUser(user);
}

export async function revokeSessions(userId: string) {
    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { sessionVersion: 1 } },
        { new: true },
    );
    return user;
}

export async function sanitizeUser(user: IUser) {
    const [permissions, roleLabels, allowedComplaintCategories] =
        await Promise.all([
            permissionsForRoles(user.roles),
            roleLabelMap(),
            allowedComplaintCategoriesForRoles(user.roles),
        ]);

    return {
        id: String(user._id),
        zaloUserId: user.zaloUserId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        email: user.email,
        address: user.address,
        roles: user.roles,
        primaryRole: user.primaryRole,
        permissions,
        roleLabels,
        status: user.status,
        householdId: user.householdId ? String(user.householdId) : undefined,
        citizenId: user.citizenId ? String(user.citizenId) : undefined,
        assignedClusters: user.assignedClusters,
        notificationPermission: user.notificationPermission,
        allowedComplaintCategories,
        createdAt: user.createdAt,
    };
}
