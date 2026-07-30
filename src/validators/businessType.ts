import { z } from "zod";

export const createBusinessTypeSchema = z.object({
    name: z.string().min(1, "Ten loai hinh kinh doanh khong duoc de trong"),
    description: z.string().optional(),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
});
export type CreateBusinessTypeInput = z.infer<typeof createBusinessTypeSchema>;

export const updateBusinessTypeSchema = createBusinessTypeSchema.partial();
export type UpdateBusinessTypeInput = z.infer<typeof updateBusinessTypeSchema>;

// Mot dong luat yeu cau giay to cho 1 loai hinh kinh doanh. reviewerRoles rong
// = fallback ve permission "businesses.verify" khi duyet (xem
// businessDocumentService.assertReviewerRoleForRule).
export const documentRuleSchema = z.object({
    documentTypeId: z.string().min(1, "Thieu loai giay to"),
    isRequired: z.boolean().default(true),
    warningBeforeDays: z.number().int().positive().optional(),
    reviewerRoles: z.array(z.string()).default([]),
});
export type DocumentRuleInput = z.infer<typeof documentRuleSchema>;

export const putDocumentRulesSchema = z.object({
    requiredDocuments: z.array(documentRuleSchema),
});
export type PutDocumentRulesInput = z.infer<typeof putDocumentRulesSchema>;
