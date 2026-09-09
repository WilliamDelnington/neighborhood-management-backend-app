import { z } from "zod";
import { LOAI_THONG_BAO, SYSTEM_ROLE_KEYS } from "@/types";

export const createAnnouncementSchema = z.object({
    title: z.string().trim().min(1, "Vui lòng nhập tiêu đề"),
    content: z.string().trim().min(1, "Vui lòng nhập nội dung"),
    category: z.enum(LOAI_THONG_BAO).default("chung"),
    priority: z.boolean().default(false),
    pinned: z.boolean().default(false),
    targetRoles: z.array(z.enum(SYSTEM_ROLE_KEYS)).optional(),
    targetClusters: z.array(z.string()).optional(),
    targetUserIds: z.array(z.string()).optional(),
    targetNeighborhoodIds: z.array(z.string()).optional(),
    isUrgent: z.boolean().default(false),
    audienceAll: z.boolean().default(true),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = createAnnouncementSchema.partial();
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
