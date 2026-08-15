import { z } from "zod";

// Mot dong luat yeu cau giay to (dung chung cho BusinessType.requiredDocuments
// va House/Household/Company.requiredDocuments). reviewerRoles rong = fallback
// ve permission ".verify" tuong ung khi duyet (xem requiredDocumentService).
export const documentRuleSchema = z.object({
    documentTypeId: z.string().min(1, "Thieu loai giay to"),
    isRequired: z.boolean().default(true),
    warningBeforeDays: z.number().int().positive().optional(),
    reviewerRoles: z.array(z.string()).default([]),
});
export type DocumentRuleInput = z.infer<typeof documentRuleSchema>;

export const putRequiredDocumentsSchema = z.object({
    requiredDocuments: z.array(documentRuleSchema),
});
export type PutRequiredDocumentsInput = z.infer<
    typeof putRequiredDocumentsSchema
>;

export const createDocumentSchema = z.object({
    documentTypeId: z.string().min(1, "Thieu loai giay to"),
    fileAssetId: z.string().min(1, "Thieu file da tai len"),
    docNumber: z.string().optional(),
    issueDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const reviewDocumentSchema = z
    .object({
        decision: z.enum(["approved", "rejected"]),
        rejectionReason: z.string().optional(),
        approvalNote: z.string().optional(),
    })
    .refine(
        data => data.decision !== "rejected" || !!data.rejectionReason?.trim(),
        {
            message: "Vui long nhap ly do khi tu choi / yeu cau bo sung",
            path: ["rejectionReason"],
        },
    );
export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>;
