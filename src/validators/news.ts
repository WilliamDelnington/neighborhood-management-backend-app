import { z } from "zod";
import { LOAI_TIN_TUC } from "@/types";

export const createNewsSchema = z.object({
    title: z.string().min(3, "Tieu de qua ngan"),
    content: z.string().min(10, "Noi dung qua ngan"),
    category: z.enum(LOAI_TIN_TUC).default("chung"),
    pinned: z.boolean().default(false),
});
export type CreateNewsInput = z.infer<typeof createNewsSchema>;

export const updateNewsSchema = createNewsSchema.partial();
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
