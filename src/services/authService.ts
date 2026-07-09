import { User, type IUser } from "@/models";
import { signSessionToken } from "@/lib/auth";
import { verifyZaloAccessToken } from "@/lib/zalo";
import { writeAuditLog } from "@/services/auditService";
import type { ZaloLoginInput, UpdateProfileInput } from "@/validators/auth";

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

    return { token, user: sanitizeUser(user) };
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
    return sanitizeUser(user);
}

export async function revokeSessions(userId: string) {
    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { sessionVersion: 1 } },
        { new: true },
    );
    return user;
}

export function sanitizeUser(user: IUser) {
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
        status: user.status,
        householdId: user.householdId ? String(user.householdId) : undefined,
        citizenId: user.citizenId ? String(user.citizenId) : undefined,
        assignedClusters: user.assignedClusters,
        notificationPermission: user.notificationPermission,
        createdAt: user.createdAt,
    };
}
