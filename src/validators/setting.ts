import { z } from "zod";

export const upsertSettingSchema = z.object({
    key: z.string().min(1, "Key cau hinh la bat buoc"),
    value: z.any(),
    description: z.string().optional(),
});
export type UpsertSettingInput = z.infer<typeof upsertSettingSchema>;
