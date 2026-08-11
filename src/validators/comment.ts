import { z } from "zod";

export const createCommentSchema = z.object({
    content: z.string().min(1, "Noi dung binh luan khong duoc de trong"),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
