import { z } from "zod";

export const createDocumentTypeSchema = z.object({
    name: z.string().min(1, "Ten loai giay to khong duoc de trong"),
    code: z.string().min(1, "Ma loai giay to khong duoc de trong"),
    description: z.string().optional(),
    hasIssueDate: z.boolean().default(false),
    hasExpiryDate: z.boolean().default(false),
    active: z.boolean().default(true),
});
export type CreateDocumentTypeInput = z.infer<typeof createDocumentTypeSchema>;

export const updateDocumentTypeSchema = createDocumentTypeSchema
    .omit({ code: true })
    .partial();
export type UpdateDocumentTypeInput = z.infer<typeof updateDocumentTypeSchema>;
