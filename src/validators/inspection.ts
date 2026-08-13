import { z } from "zod";
import {
    INSPECTION_CHECKLIST_INPUT_TYPE,
    INSPECTION_OUTCOME,
} from "@/types";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "ID không hợp lệ");

const campaignChecklistItemSchema = z.object({
    itemId: z.string().trim().min(1).max(100),
    label: z.string().trim().min(2, "Nội dung checklist quá ngắn").max(500),
    inputType: z.enum(INSPECTION_CHECKLIST_INPUT_TYPE),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
}).superRefine((item, ctx) => {
    if (
        ["SINGLE_SELECT", "MULTI_SELECT"].includes(item.inputType) &&
        (!item.options || item.options.length === 0)
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["options"],
            message: "Câu hỏi lựa chọn phải có ít nhất một phương án",
        });
    }
});

export const createInspectionCampaignSchema = z.object({
    name: z.string().trim().min(3, "Tên chiến dịch quá ngắn").max(300),
    purpose: z.string().trim().min(10, "Mục tiêu chiến dịch quá ngắn").max(5000),
    checklistTemplate: z.array(campaignChecklistItemSchema).min(1).max(200),
    allowSelfDeclaration: z.boolean().default(false),
    requiredEvidence: z.boolean().default(false),
    startAt: z.string().datetime(),
    dueAt: z.string().datetime(),
    targetNeighborhoodIds: z.array(objectId).min(1).max(200),
    targetHouseIds: z.array(objectId).min(1).max(5000).optional(),
}).superRefine((input, ctx) => {
    if (new Date(input.dueAt) <= new Date(input.startAt)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dueAt"],
            message: "Thời hạn phải sau thời điểm bắt đầu",
        });
    }
    const itemIds = input.checklistTemplate.map(item => item.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["checklistTemplate"],
            message: "Mã mục checklist không được trùng nhau",
        });
    }
});
export type CreateInspectionCampaignInput = z.infer<
    typeof createInspectionCampaignSchema
>;

export const updateInspectionCampaignChecklistSchema = z.object({
    checklistTemplate: z.array(campaignChecklistItemSchema).min(1).max(200),
}).superRefine((input, ctx) => {
    const itemIds = input.checklistTemplate.map(item => item.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["checklistTemplate"],
            message: "Mã mục checklist không được trùng nhau",
        });
    }
});
export type UpdateInspectionCampaignChecklistInput = z.infer<
    typeof updateInspectionCampaignChecklistSchema
>;

export const inspectionAnswerSchema = z.object({
    checklistItemId: z.string().trim().min(1),
    value: z.unknown(),
});

export const saveInspectionResultSchema = z.object({
    targetId: objectId,
    answers: z.array(inspectionAnswerSchema).max(200).default([]),
    gpsLat: z.number().min(-90).max(90).optional(),
    gpsLng: z.number().min(-180).max(180).optional(),
    note: z.string().trim().max(5000).optional(),
    outcome: z.enum(INSPECTION_OUTCOME).optional(),
});
export type SaveInspectionResultInput = z.infer<typeof saveInspectionResultSchema>;

export const updateInspectionResultSchema = saveInspectionResultSchema.omit({
    targetId: true,
});
export type UpdateInspectionResultInput = z.infer<
    typeof updateInspectionResultSchema
>;

export const houseInspectionSelfDeclarationSchema = updateInspectionResultSchema.omit({
    gpsLat: true,
    gpsLng: true,
    outcome: true,
});
export type HouseInspectionSelfDeclarationInput = z.infer<
    typeof houseInspectionSelfDeclarationSchema
>;

export const assignInspectionTargetsSchema = z.object({
    targetIds: z.array(objectId).min(1).max(500),
    collaboratorUserId: objectId,
});
export type AssignInspectionTargetsInput = z.infer<
    typeof assignInspectionTargetsSchema
>;

export const inspectionReviewSchema = z.object({
    note: z.string().trim().max(5000).optional(),
    outcome: z.enum(INSPECTION_OUTCOME).optional(),
});
export type InspectionReviewInput = z.infer<typeof inspectionReviewSchema>;

export const remindInspectionSchema = z.object({
    targetIds: z.array(objectId).min(1).max(500).optional(),
    message: z.string().trim().max(1000).optional(),
});
export type RemindInspectionInput = z.infer<typeof remindInspectionSchema>;

export const submitInspectionToWardSchema = z.object({
    neighborhoodId: objectId.optional(),
});
export type SubmitInspectionToWardInput = z.infer<
    typeof submitInspectionToWardSchema
>;
