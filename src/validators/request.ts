import { z } from "zod";
import { REQUEST_STATUS, REQUEST_TYPES } from "@/types";

export const createRequestSchema = z
    .object({
        type: z.enum(REQUEST_TYPES),
        title: z.string().min(1, "Thieu tieu de yeu cau"),
        description: z.string().optional(),
        relatedModel: z.string().optional(),
        relatedId: z.string().optional(),
        houseId: z.string().optional(),
        dueDate: z.string().datetime().optional(),
        targetUserIds: z.array(z.string()).default([]),
        targetRoles: z.array(z.string()).default([]),
    })
    .refine(
        data => data.targetUserIds.length > 0 || data.targetRoles.length > 0,
        { message: "Can chon it nhat mot nguoi nhan hoac mot loai nguoi dung" },
    );
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateRequestSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    note: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    addTargetUserIds: z.array(z.string()).optional(),
    addTargetRoles: z.array(z.string()).optional(),
});
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const updateMyRequestStatusSchema = z.object({
    status: z.enum(REQUEST_STATUS),
    note: z.string().optional(),
});
export type UpdateMyRequestStatusInput = z.infer<
    typeof updateMyRequestStatusSchema
>;
