import { z } from "zod";
import { LOAI_THONG_BAO, ROLES } from "@/types";

export const createAnnouncementSchema = z.object({
    title: z.string().min(3, "Tieu de qua ngan"),
    content: z.string().min(10, "Noi dung qua ngan"),
    category: z.enum(LOAI_THONG_BAO).default("chung"),
    priority: z.boolean().default(false),
    pinned: z.boolean().default(false),
    targetRoles: z.array(z.enum(ROLES)).optional(),
    targetClusters: z.array(z.string()).optional(),
    audienceAll: z.boolean().default(true),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = createAnnouncementSchema.partial();
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
