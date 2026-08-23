import { Role as RoleModel, User, Household, Citizen, type IUser } from "@/models";
import { signSessionToken, hashPassword, comparePassword } from "@/lib/auth";
import { verifyZaloAccessToken, verifyZaloPhoneToken } from "@/lib/zalo";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { recomputeHouseholdMemberCount } from "@/services/citizenService";
import { loginRateLimiter } from "@/lib/rateLimit";
import { getUserPermissionSet, getUserAllowedComplaintCategories } from "@/lib/rbac";
import { ROLE_LABEL } from "@/types";
import { maskIdNumber } from "@/lib/encryption";
import type {
    ZaloLoginInput,
    UpdateProfileInput,
    PhoneRegisterInput,
    PhoneLoginInput,
    ChangePhoneInput,
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

    const verifiedPhone = await verifyZaloPhoneToken(
        input.accessToken,
        input.phoneToken,
        input.phone,
    );

    let user = await User.findOne({ zaloUserId: profile.zaloUserId });

    if (profile.verifiedVia === "graph_api" && !user && !verifiedPhone) {
        throw new HttpError(
            "Vui lòng cho phép chia sẻ số điện thoại để liên kết tài khoản",
            403,
        );
    }

    if (user && verifiedPhone) {
        const conflictingUser = await User.findOne({
            phone: verifiedPhone,
            _id: { $ne: user._id },
        });
        if (conflictingUser) {
            throw new HttpError(
                "Số điện thoại này đã thuộc một tài khoản khác",
                409,
            );
        }
    }

    // A leader-created account initially has only a verified administrative
    // phone record. Link it only after Zalo verifies the same phone for the
    // authenticated Zalo identity.
    if (!user && verifiedPhone) {
        const phoneUser = await User.findOne({ phone: verifiedPhone });
        if (phoneUser) {
            if (
                phoneUser.zaloUserId &&
                phoneUser.zaloUserId !== profile.zaloUserId
            ) {
                throw new HttpError(
                    "Số điện thoại này đã liên kết với tài khoản Zalo khác",
                    409,
                );
            }
            phoneUser.zaloUserId = profile.zaloUserId;
            user = phoneUser;
        }
    }

    if (!user) {
        user = await User.create({
            zaloUserId: profile.zaloUserId,
            displayName: profile.name || input.name || "Người dùng Zalo",
            avatarUrl: profile.avatarUrl || input.avatarUrl,
            phone: verifiedPhone,
            roles: ["house_owner"],
            primaryRole: "house_owner",
            status: "active",
        });
    } else {
        user.lastLoginAt = new Date();
        if (verifiedPhone && !user.phone) user.phone = verifiedPhone;
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

    return { token, user: await sanitizeUserWithPermissions(user) };
}

export async function registerWithPhone(input: PhoneRegisterInput) {
    const existing = await User.findOne({ phone: input.phone });
    if (existing) {
        throw new HttpError("Số điện thoại đã được sử dụng", 409);
    }

    const passwordHash = await hashPassword(input.password);
    let user: IUser;
    try {
        user = await User.create({
            phone: input.phone,
            passwordHash,
            displayName: input.displayName,
            roles: ["house_owner"],
            primaryRole: "house_owner",
            status: "active",
        });
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError("Số điện thoại đã được sử dụng", 409);
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

    return { token, user: await sanitizeUserWithPermissions(user) };
}

export async function loginWithPhone(input: PhoneLoginInput) {
    loginRateLimiter.check(input.phone);

    const user = await User.findOne({ phone: input.phone }).select(
        "+passwordHash",
    );
    if (!user || !user.passwordHash) {
        throw new HttpError("Số điện thoại hoặc mật khẩu không đúng", 401);
    }
    if (user.status === "locked") {
        throw new HttpError("Tài khoản đã bị khóa", 401);
    }

    const matches = await comparePassword(input.password, user.passwordHash);
    if (!matches) {
        throw new HttpError("Số điện thoại hoặc mật khẩu không đúng", 401);
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

    return { token, user: await sanitizeUserWithPermissions(user) };
}

export async function setPassword(
    userId: string,
    input: { currentPassword?: string; password: string },
) {
    const user = await User.findById(userId).select("+passwordHash");
    if (!user) throw new HttpError("Không tìm thấy tài khoản", 404);

    if (user.passwordHash) {
        if (!input.currentPassword) {
            throw new HttpError("Vui lòng nhập mật khẩu hiện tại", 400);
        }
        const matches = await comparePassword(
            input.currentPassword,
            user.passwordHash,
        );
        if (!matches) {
            throw new HttpError("Mật khẩu hiện tại không đúng", 401);
        }
    }

    user.passwordHash = await hashPassword(input.password);
    await user.save();
    return sanitizeUserWithPermissions(user);
}

export async function updateOwnProfile(
    userId: string,
    input: UpdateProfileInput,
) {
    const user = await User.findById(userId);
    if (!user) throw new Error("Khong tim thay tai khoan");
    if (input.email !== undefined) user.email = input.email;
    if (input.address !== undefined) user.address = input.address;
    if (input.notificationPermission !== undefined) {
        user.notificationPermission = input.notificationPermission;
    }

    if (
        input.householdId !== undefined &&
        input.householdId !== String(user.householdId || "")
    ) {
        const household = await Household.findById(input.householdId);
        if (!household) throw new HttpError("Không tìm thấy hộ dân", 404);

        const oldHouseholdId = user.householdId
            ? String(user.householdId)
            : undefined;

        if (user.citizenId) {
            await Citizen.findByIdAndUpdate(user.citizenId, {
                householdId: household._id,
                updatedBy: user._id,
            });
        } else {
            const citizen = await Citizen.create({
                fullName: user.displayName,
                phone: user.phone,
                householdId: household._id,
                zaloUserId: user._id,
                createdBy: user._id,
                updatedBy: user._id,
            });
            user.citizenId = citizen._id;
        }
        user.householdId = household._id;

        if (oldHouseholdId) {
            await recomputeHouseholdMemberCount(oldHouseholdId);
        }
        await recomputeHouseholdMemberCount(household._id);

        await writeAuditLog({
            actorId: user._id,
            action: "user.link_household",
            targetModel: "User",
            targetId: user._id,
            metadata: { householdId: String(household._id) },
        });
    }

    try {
        await user.save();
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError("Số điện thoại đã được sử dụng", 409);
        }
        throw err;
    }
    return sanitizeUserWithPermissions(user);
}

export async function revokeSessions(userId: string) {
    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { sessionVersion: 1 } },
        { new: true },
    );
    return user;
}

/**
 * Doi so dien thoai dang nhap - xac thuc lai qua Zalo getPhoneNumber (cung
 * co che voi loginWithZalo o tren), KHONG nhan phone tho chua xac thuc tu
 * client nhu updateOwnProfile truoc day (xem ghi chu tren
 * updateProfileSchema/changePhoneSchema).
 */
export async function changeOwnPhone(
    userId: string,
    input: ChangePhoneInput,
) {
    const verifiedPhone = await verifyZaloPhoneToken(
        input.accessToken,
        input.phoneToken,
        input.phone,
    );
    if (!verifiedPhone) {
        throw new HttpError(
            "Không xác thực được số điện thoại từ Zalo, vui lòng thử lại",
            400,
        );
    }

    const user = await User.findById(userId);
    if (!user) throw new HttpError("Không tìm thấy tài khoản", 404);

    const conflictingUser = await User.findOne({
        phone: verifiedPhone,
        _id: { $ne: user._id },
    });
    if (conflictingUser) {
        throw new HttpError("Số điện thoại này đã thuộc một tài khoản khác", 409);
    }

    user.phone = verifiedPhone;
    try {
        await user.save();
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new HttpError("Số điện thoại đã được sử dụng", 409);
        }
        throw err;
    }

    await writeAuditLog({
        actorId: user._id,
        action: "user.change_phone",
        targetModel: "User",
        targetId: user._id,
    });

    return sanitizeUserWithPermissions(user);
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
        // Che so CMND/CCCD, chi giu lai 4 so cuoi - cung mot quy tac voi
        // Citizen.cccd (xem Citizen.ts toJSON transform), nhung sanitizeUser
        // tu chon truong thu cong (khong dung Document.toJSON) nen phai che
        // tay o day.
        idNumber: user.idNumber ? maskIdNumber(user.idNumber) : undefined,
        roles: user.roles,
        primaryRole: user.primaryRole,
        status: user.status,
        // Tai khoan cu chua backfill duoc hieu dung theo che do dang nhap
        // hien tai: so dien thoai tam thoi, chua xac minh danh tinh quoc gia.
        identityProvider: user.identityProvider || "phone_temporary",
        identityVerificationStatus:
            user.identityVerificationStatus || "unverified",
        identityVerifiedAt: user.identityVerifiedAt,
        householdId: user.householdId ? String(user.householdId) : undefined,
        citizenId: user.citizenId ? String(user.citizenId) : undefined,
        neighborhoodId: user.neighborhoodId
            ? String(user.neighborhoodId)
            : undefined,
        assignedNeighborhoodIds: (user.assignedNeighborhoodIds || []).map(String),
        assignedClusters: user.assignedClusters,
        provinceCode: user.provinceCode,
        provinceName: user.provinceName,
        wardCode: user.wardCode,
        wardName: user.wardName,
        notificationPermission: user.notificationPermission,
        createdAt: user.createdAt,
    };
}

/**
 * Giong sanitizeUser nhung kem theo permission hieu luc + nhan hien thi cua
 * tung role - danh rieng cho cac response tra ve CHINH nguoi dang dang nhap
 * (login/register/me/set-password), vi frontend (vd trang quan tri) dung
 * user.permissions de an/hien menu va guard route. KHONG dung cho danh sach/
 * chi tiet nguoi dung khac (userService.ts) de tranh N+1 query khong can thiet
 * khi chi hien thi thong tin, khong dung de tu-phan-quyen ban than.
 */
export async function sanitizeUserWithPermissions(user: IUser) {
    const base = sanitizeUser(user);
    const [permissions, roleDocs, allowedComplaintCategories] = await Promise.all([
        getUserPermissionSet(user),
        RoleModel.find({ key: { $in: user.roles } }).select("key name"),
        getUserAllowedComplaintCategories(user),
    ]);

    const roleLabels: Record<string, string> = {};
    for (const key of user.roles) {
        const doc = roleDocs.find(r => r.key === key);
        roleLabels[key] = doc?.name || ROLE_LABEL[key] || key;
    }

    return {
        ...base,
        permissions: [...permissions],
        roleLabels,
        allowedComplaintCategories,
    };
}
