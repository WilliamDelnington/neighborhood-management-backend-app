import { z } from "zod";

export const createDocumentTypeSchema = z.object({
    name: z.string().min(1, "Tên loại giấy tờ không được để trống"),
    code: z.string().min(1, "Mã loại giấy tờ không được để trống"),
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
