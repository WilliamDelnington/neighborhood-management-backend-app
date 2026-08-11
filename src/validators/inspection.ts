import { z } from "zod";
import { INSPECTION_OUTCOME } from "@/types";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "ID không hợp lệ");

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
