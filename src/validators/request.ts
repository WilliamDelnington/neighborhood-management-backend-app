import { z } from "zod";
import {
    REQUEST_HOUSE_ROLES,
    REQUEST_PRIORITIES,
    REQUEST_STATUS,
    REQUEST_TYPES,
} from "@/types";

export const createRequestSchema = z
    .object({
        type: z.enum(REQUEST_TYPES),
        title: z.string().min(1, "Thieu tieu de yeu cau"),
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
    })
    .refine(
        data =>
            data.targetUserIds.length > 0 ||
            data.targetRoles.length > 0 ||
            (!!data.houseId && !!data.houseRole) ||
            (!!data.houseId && !!data.targetHouseNeighborhoodLeader),
        { message: "Can chon it nhat mot nguoi nhan hoac mot loai nguoi dung" },
    );
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

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
        message: "Vui long mo ta thong tin can bo sung",
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
