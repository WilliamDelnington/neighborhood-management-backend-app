import { z } from "zod";

export const createCorrespondenceSchema = z.object({
    correspondenceTypeId: z.string().min(1, "Chưa chọn loại văn bản"),
    documentNumber: z.string().optional(),
    title: z.string().min(3, "Tiêu đề quá ngắn"),
    content: z.string().min(10, "Nội dung quá ngắn"),
    issuedAt: z.coerce.date(),
    isUrgent: z.boolean().default(false),
    targetNeighborhoodIds: z.array(z.string()).optional(),
    targetUserIds: z.array(z.string()).optional(),
});
export type CreateCorrespondenceInput = z.infer<
    typeof createCorrespondenceSchema
>;

export const updateCorrespondenceSchema = createCorrespondenceSchema
    .omit({ correspondenceTypeId: true })
    .partial();
export type UpdateCorrespondenceInput = z.infer<
    typeof updateCorrespondenceSchema
>;

export const createCorrespondenceReplySchema = z.object({
    content: z.string().min(1, "Nội dung phản hồi không được để trống"),
});
export type CreateCorrespondenceReplyInput = z.infer<
    typeof createCorrespondenceReplySchema
>;
