import { User, type IUser } from "@/models";
import { signSessionToken, hashPassword, comparePassword } from "@/lib/auth";
import { verifyZaloAccessToken } from "@/lib/zalo";
import { writeAuditLog } from "@/services/auditService";
import { HttpError } from "@/lib/response";
import { loginRateLimiter } from "@/lib/rateLimit";
import type {
    ZaloLoginInput,
    UpdateProfileInput,
    PhoneRegisterInput,
    PhoneLoginInput,
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

    return { token, user: sanitizeUser(user) };
}

export async function registerWithPhone(input: PhoneRegisterInput) {
    const existing = await User.findOne({ phone: input.phone });
    if (existing) {
        throw new HttpError("So dien thoai da duoc su dung", 409);
    }

    const passwordHash = await hashPassword(input.password);
    let user: IUser;
    try {
        user = await User.create({
            phone: input.phone,
            passwordHash,
            displayName: input.displayName,
            roles: ["resident"],
            primaryRole: "resident",
            status: "active",
        });
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError("So dien thoai da duoc su dung", 409);
        }
        throw err;
    }

    const token = signSessionToken({
        userId: String(user._id),
        primaryRole: user.primaryRole,
        roles: user.roles,
        sv: user.sessionVersion,
    });

    await writeAuditLog({
        actorId: user._id,
        action: "auth.register.phone",
        targetModel: "User",
        targetId: user._id,
    });

    return { token, user: sanitizeUser(user) };
}

export async function loginWithPhone(input: PhoneLoginInput) {
    loginRateLimiter.check(input.phone);

    const user = await User.findOne({ phone: input.phone }).select(
        "+passwordHash",
    );
    if (!user || !user.passwordHash) {
        throw new HttpError("So dien thoai hoac mat khau khong dung", 401);
    }
    if (user.status === "locked") {
        throw new HttpError("Tai khoan da bi khoa", 401);
    }

    const matches = await comparePassword(input.password, user.passwordHash);
    if (!matches) {
        throw new HttpError("So dien thoai hoac mat khau khong dung", 401);
    }

    loginRateLimiter.reset(input.phone);
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
        action: "auth.login.phone",
        targetModel: "User",
        targetId: user._id,
    });

    return { token, user: sanitizeUser(user) };
}

export async function setPassword(userId: string, password: string) {
    const user = await User.findById(userId);
    if (!user) throw new HttpError("Khong tim thay tai khoan", 404);
    user.passwordHash = await hashPassword(password);
    await user.save();
    return sanitizeUser(user);
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
    try {
        await user.save();
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError("So dien thoai da duoc su dung", 409);
        }
        throw err;
    }
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
