import { z } from "zod";

export const zaloLoginSchema = z.object({
    accessToken: z.string().min(1, "Thieu accessToken"),
    zaloUserId: z.string().min(1, "Thieu zaloUserId"),
    name: z.string().optional(),
    avatarUrl: z.string().optional(),
    phone: z.string().optional(),
});
export type ZaloLoginInput = z.infer<typeof zaloLoginSchema>;

export const updateProfileSchema = z.object({
    displayName: z.string().min(1).optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    notificationPermission: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
