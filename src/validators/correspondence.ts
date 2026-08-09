import { z } from "zod";

export const createCorrespondenceSchema = z.object({
    correspondenceTypeId: z.string().min(1, "Chua chon loai van ban"),
    documentNumber: z.string().optional(),
    title: z.string().min(3, "Tieu de qua ngan"),
    content: z.string().min(10, "Noi dung qua ngan"),
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
    content: z.string().min(1, "Noi dung phan hoi khong duoc de trong"),
});
export type CreateCorrespondenceReplyInput = z.infer<
    typeof createCorrespondenceReplySchema
>;
