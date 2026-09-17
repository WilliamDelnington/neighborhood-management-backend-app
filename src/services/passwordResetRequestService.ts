import {
    PasswordResetRequest,
    User,
    type IPasswordResetRequest,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { normalizePhone } from "@/lib/encryption";
import {
    passwordResetRequestRateLimiter,
    passwordResetCheckRateLimiter,
} from "@/lib/rateLimit";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import {
    resetUserPasswordAuto,
    resolveResponsibleLeaderIds,
} from "@/services/userService";
import type {
    CreatePasswordResetRequestInput,
    UpdatePasswordResetRequestStatusInput,
} from "@/validators/passwordResetRequest";

export async function createPasswordResetRequest(
    input: CreatePasswordResetRequestInput,
): Promise<IPasswordResetRequest> {
    const phone = normalizePhone(input.phone);
    passwordResetRequestRateLimiter.check(phone);

    const request = await PasswordResetRequest.create({
        phone,
        note: input.note,
        status: "moi",
    });

    // Uu tien bao dich danh cho DUNG to truong/to pho phu trach so dien thoai
    // nay (xem resolveResponsibleLeaderIds - theo Nha ho dang dung chu); neu
    // khong xac dinh duoc (chua co tai khoan/chua gan Nha/chua co to truong)
    // thi fallback ve bao rong cho admin + toan bo to truong/to pho nhu truoc,
    // de yeu cau khong bi "mat tich" khong ai xu ly. Luu y: targetUserIds va
    // targetRoles KHONG cong don trong createNotification - chi dung mot
    // trong hai (targetRoles bi bo qua neu targetUserIds khong rong).
    const leaderIds = await resolveResponsibleLeaderIds(phone);

    await createNotification({
        title: "Yêu cầu đặt lại mật khẩu mới",
        body: `Số điện thoại ${phone} yêu cầu hỗ trợ đặt lại mật khẩu`,
        type: "password_reset_request.created",
        targetUserIds: leaderIds.length > 0 ? leaderIds : undefined,
        targetRoles:
            leaderIds.length > 0
                ? []
                : ["admin", "neighborhood_leader", "neighborhood_coleader"],
        relatedModel: "PasswordResetRequest",
        relatedId: request._id,
    });

    return request;
}

/**
 * To truong/to pho/admin bam nut "Dat lai mat khau" tren PasswordResetRequest
 * (thay vi go tay mat khau qua man Nguoi dung) - tu sinh mat khau ngau nhien
 * (resetUserPasswordAuto), luu TAM vao generatedPassword de citizen tu lay lai
 * qua revealPasswordResetRequest (chua co SMS/Zalo OA - xem
 * notification_channels). Actor phai trong pham vi phu trach cua tai khoan
 * khop so dien thoai nay (assertUserInLeaderScope, giong resetUserPasswordByAdmin).
 */
export async function resetPasswordForRequest(
    actorUser: IUser,
    id: string,
): Promise<{ request: IPasswordResetRequest; plainPassword: string }> {
    const request = await PasswordResetRequest.findById(id).select(
        "+generatedPassword",
    );
    if (!request) throw new HttpError("Không tìm thấy yêu cầu", 404);
    if (request.status === "dong") {
        throw new HttpError("Yêu cầu này đã đóng", 400);
    }

    const target = await User.findOne({ phone: request.phone });
    if (!target) {
        throw new HttpError(
            "Không tìm thấy tài khoản với số điện thoại này",
            404,
        );
    }

    const { plainPassword } = await resetUserPasswordAuto(
        actorUser,
        String(target._id),
    );

    request.status = "da_xu_ly";
    request.resolvedByUserId = actorUser._id as any;
    request.resolvedAt = new Date();
    request.generatedPassword = plainPassword;
    request.revealedAt = undefined;
    await request.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "password_reset_request.auto_reset",
        targetModel: "PasswordResetRequest",
        targetId: request._id,
    });

    return { request, plainPassword };
}

export type PasswordResetCheckState = "none" | "pending" | "ready";

/**
 * Buoc 1 phia cong dan (man "Quen mat khau"): kiem tra yeu cau gan nhat cho so
 * dien thoai nay dang o trang thai nao - KHONG tra ve mat khau (xem
 * revealPasswordResetRequest cho buoc 2). "none" dung chung cho ca truong hop
 * chua tung gui yeu cau LAN da duoc lay mat khau roi (dong), giong quy uoc
 * khong lo thong tin cua createPasswordResetRequest.
 */
export async function checkPasswordResetRequestByPhone(
    phone: string,
): Promise<{ state: PasswordResetCheckState }> {
    const normalized = normalizePhone(phone);
    passwordResetCheckRateLimiter.check(normalized);

    const request = await PasswordResetRequest.findOne({
        phone: normalized,
    })
        .sort({ createdAt: -1 })
        .select("+generatedPassword");

    if (!request) return { state: "none" };
    if (request.status === "moi") return { state: "pending" };
    if (request.status === "da_xu_ly" && request.generatedPassword) {
        return { state: "ready" };
    }
    return { state: "none" };
}

/**
 * Buoc 2 phia cong dan: lay mat khau moi (mot lan duy nhat) roi xoa ngay khoi
 * DB va dong yeu cau - khong ai (ke ca nhan vien) xem lai duoc mat khau nay
 * qua danh sach nua sau khi da "lay ve". Nguoi dung se bi bat doi mat khau
 * ngay lan dang nhap ke tiep (User.mustChangePassword, dat tu resetUserPasswordAuto).
 */
export async function revealPasswordResetRequest(
    phone: string,
): Promise<string> {
    const normalized = normalizePhone(phone);
    passwordResetCheckRateLimiter.check(`reveal:${normalized}`);

    const request = await PasswordResetRequest.findOne({
        phone: normalized,
        status: "da_xu_ly",
    })
        .sort({ createdAt: -1 })
        .select("+generatedPassword");

    if (!request || !request.generatedPassword) {
        throw new HttpError(
            "Chưa có mật khẩu mới nào cho số điện thoại này",
            404,
        );
    }

    const plainPassword = request.generatedPassword;
    request.revealedAt = new Date();
    request.generatedPassword = undefined;
    request.status = "dong";
    await request.save();

    return plainPassword;
}

/**
 * Tra kem "matchedUser" (neu so dien thoai khop mot tai khoan) de nhan vien
 * biet ngay day la tai khoan gi (house_owner/staff/admin) truoc khi quyet
 * dinh tu dat lai hay chuyen cho developer (truong hop tai khoan admin duy
 * nhat bi khoa - xem ghi chu trong PasswordResetRequestListPage).
 */
export async function listPasswordResetRequests(params: {
    page: number;
    limit: number;
    status?: string;
    search?: string;
}) {
    const clauses: Record<string, unknown>[] = [];
    if (params.status) clauses.push({ status: params.status });
    if (params.search) {
        clauses.push({ phone: { $regex: params.search, $options: "i" } });
    }
    const filter: Record<string, unknown> =
        clauses.length > 0 ? { $and: clauses } : {};

    const [items, total] = await Promise.all([
        PasswordResetRequest.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("resolvedByUserId", "displayName"),
        PasswordResetRequest.countDocuments(filter),
    ]);

    const phones = items.map(item => item.phone);
    const matchedUsers =
        phones.length > 0
            ? await User.find({ phone: { $in: phones } }).select(
                  "displayName phone roles",
              )
            : [];
    const matchedUserByPhone = new Map(
        matchedUsers.map(user => [user.phone, user]),
    );

    return {
        items: items.map(item => {
            const matched = matchedUserByPhone.get(item.phone);
            return {
                ...item.toObject(),
                matchedUser: matched
                    ? {
                          _id: String(matched._id),
                          displayName: matched.displayName,
                          roles: matched.roles,
                      }
                    : undefined,
            };
        }),
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function updatePasswordResetRequestStatus(
    actorUser: IUser,
    id: string,
    input: UpdatePasswordResetRequestStatusInput,
): Promise<IPasswordResetRequest> {
    const request = await PasswordResetRequest.findById(id);
    if (!request) throw new HttpError("Không tìm thấy yêu cầu", 404);

    request.status = input.status;
    if (input.status === "da_xu_ly" || input.status === "dong") {
        request.resolvedByUserId = actorUser._id as any;
        request.resolvedAt = new Date();
    } else {
        request.resolvedByUserId = undefined;
        request.resolvedAt = undefined;
    }
    await request.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "password_reset_request.status_change",
        targetModel: "PasswordResetRequest",
        targetId: request._id,
        metadata: { status: input.status },
    });

    return request;
}
