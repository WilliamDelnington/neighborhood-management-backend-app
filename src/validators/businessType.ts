import { z } from "zod";
import {
    documentRuleSchema,
    putRequiredDocumentsSchema,
    type DocumentRuleInput,
    type PutRequiredDocumentsInput,
} from "./requiredDocument";

export const createBusinessTypeSchema = z.object({
    name: z.string().min(1, "Ten loai hinh kinh doanh khong duoc de trong"),
    description: z.string().optional(),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
});
export type CreateBusinessTypeInput = z.infer<typeof createBusinessTypeSchema>;

export const updateBusinessTypeSchema = createBusinessTypeSchema.partial();
export type UpdateBusinessTypeInput = z.infer<typeof updateBusinessTypeSchema>;

// Dong luat yeu cau giay to cho 1 loai hinh kinh doanh - dung chung voi
// House/Household/Company qua validators/requiredDocument.ts. reviewerRoles
// rong = fallback ve permission "businesses.verify" khi duyet (xem
// businessDocumentService.assertReviewerRoleForRule).
export { documentRuleSchema, type DocumentRuleInput };

export const putDocumentRulesSchema = putRequiredDocumentsSchema;
export type PutDocumentRulesInput = PutRequiredDocumentsInput;
