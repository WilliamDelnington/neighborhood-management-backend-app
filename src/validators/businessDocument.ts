import { z } from "zod";

export const createBusinessDocumentSchema = z.object({
    documentTypeId: z.string().min(1, "Thieu loai giay to"),
    fileAssetId: z.string().min(1, "Thieu file da tai len"),
    docNumber: z.string().optional(),
    issueDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
});
export type CreateBusinessDocumentInput = z.infer<
    typeof createBusinessDocumentSchema
>;

export const reviewBusinessDocumentSchema = z
    .object({
        decision: z.enum(["approved", "rejected"]),
        rejectionReason: z.string().optional(),
    })
    .refine(
        data => data.decision !== "rejected" || !!data.rejectionReason?.trim(),
        {
            message: "Vui long nhap ly do khi tu choi / yeu cau bo sung",
            path: ["rejectionReason"],
        },
    );
export type ReviewBusinessDocumentInput = z.infer<
    typeof reviewBusinessDocumentSchema
>;
