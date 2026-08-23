import { z } from "zod";
import {
    REQUEST_HOUSE_ROLES,
    REQUEST_PRIORITIES,
    REQUEST_STATUS,
} from "@/types";

const requestTypeKeySchema = z
    .string()
    .min(1, "Thiếu loại yêu cầu")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Loại yêu cầu không hợp lệ");

export const createRequestSchema = z
    .object({
        type: requestTypeKeySchema,
        title: z.string().min(1, "Thiếu tiêu đề yêu cầu"),
        description: z.string().optional(),
        priority: z.enum(REQUEST_PRIORITIES).default("normal"),
        relatedModel: z.string().optional(),
        relatedId: z.string().optional(),
        houseId: z.string().optional(),
        dueDate: z.string().datetime().optional(),
        targetUserIds: z.array(z.string()).default([]),
        targetRoles: z.array(z.string()).default([]),
        // Ca hai truong duoi day chi co hieu luc khi houseId duoc dat - xem
        // requestService.resolveHouseRoleRecipientIds/resolveHouseLeaderRecipientIds.
        // Chi neighborhood_leader/neighborhood_coleader duoc dat (kiem tra o
        // service, khong phai o day).
        houseRole: z.enum(REQUEST_HOUSE_ROLES).optional(),
        targetHouseNeighborhoodLeader: z.boolean().optional(),
        // Payload bieu mau dong; service se validate theo dung version cua
        // RequestTypeDefinition va ma hoa truoc khi luu.
        formData: z.record(z.unknown()).optional(),
    })
    .refine(
        data =>
            data.targetUserIds.length > 0 ||
            data.targetRoles.length > 0 ||
            (!!data.houseId && !!data.houseRole) ||
            (!!data.houseId && !!data.targetHouseNeighborhoodLeader),
        { message: "Cần chọn ít nhất một người nhận hoặc một loại người dùng" },
    );
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateRequestFormDataSchema = z.object({
    formData: z.record(z.unknown()),
});
export type UpdateRequestFormDataInput = z.infer<
    typeof updateRequestFormDataSchema
>;

export const updateRequestSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    note: z.string().optional(),
    priority: z.enum(REQUEST_PRIORITIES).optional(),
    dueDate: z.string().datetime().optional(),
    addTargetUserIds: z.array(z.string()).optional(),
    addTargetRoles: z.array(z.string()).optional(),
});
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const updateMyRequestStatusSchema = z
    .object({
        status: z.enum(REQUEST_STATUS),
        note: z.string().optional(),
    })
    .refine(data => data.status !== "needs_info" || !!data.note?.trim(), {
        message: "Vui lòng mô tả thông tin cần bổ sung",
        path: ["note"],
    });
export type UpdateMyRequestStatusInput = z.infer<
    typeof updateMyRequestStatusSchema
>;

export const confirmRequestRecipientSchema = z.object({
    decision: z.enum(["resolved", "in_progress"]),
    note: z.string().optional(),
});
export type ConfirmRequestRecipientInput = z.infer<
    typeof confirmRequestRecipientSchema
>;

export const initiateRequestTransferSchema = z.object({
    toUserId: z.string().min(1, "Thiếu người được chuyển"),
    reason: z.string().trim().min(1, "Vui lòng nhập lý do chuyển tiếp"),
});
export type InitiateRequestTransferInput = z.infer<
    typeof initiateRequestTransferSchema
>;

export const respondToRequestTransferSchema = z.object({
    decision: z.enum(["accept", "reject"]),
});
export type RespondToRequestTransferInput = z.infer<
    typeof respondToRequestTransferSchema
>;
