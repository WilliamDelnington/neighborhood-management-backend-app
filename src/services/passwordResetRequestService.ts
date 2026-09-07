import {
    PasswordResetRequest,
    User,
    type IPasswordResetRequest,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { normalizePhone } from "@/lib/encryption";
import { passwordResetRequestRateLimiter } from "@/lib/rateLimit";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
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

    // Nguoi co the xu ly (dat lai mat khau qua man Nguoi dung): admin (khong
    // gioi han) va to truong/to pho (chi dat lai duoc tai khoan house_owner
    // trong to dan pho minh phu trach - xem resetUserPasswordByAdmin). Thong
    // bao rong cho ca ba, viec gioi han thuc su van do chinh thao tac dat lai
    // mat khau quyet dinh.
    await createNotification({
        title: "Yêu cầu đặt lại mật khẩu mới",
        body: `Số điện thoại ${phone} yêu cầu hỗ trợ đặt lại mật khẩu`,
        type: "password_reset_request.created",
        targetRoles: ["admin", "neighborhood_leader", "neighborhood_coleader"],
        relatedModel: "PasswordResetRequest",
        relatedId: request._id,
    });

    return request;
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
