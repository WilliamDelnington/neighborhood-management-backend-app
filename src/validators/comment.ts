import { z } from "zod";

export const createCommentSchema = z.object({
    content: z.string().min(1, "Nội dung bình luận không được để trống"),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
