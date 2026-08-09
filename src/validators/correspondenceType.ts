import { z } from "zod";

export const createCorrespondenceTypeSchema = z.object({
    name: z.string().min(1, "Ten loai van ban khong duoc de trong"),
    code: z.string().min(1, "Ma loai van ban khong duoc de trong"),
    description: z.string().optional(),
    allowedSenderRoles: z.array(z.string()).min(1, "Chon it nhat mot vai tro nguoi gui"),
    allowedReceiverRoles: z
        .array(z.string())
        .min(1, "Chon it nhat mot vai tro nguoi nhan"),
    requireDocumentNumber: z.boolean().default(false),
    active: z.boolean().default(true),
});
export type CreateCorrespondenceTypeInput = z.infer<
    typeof createCorrespondenceTypeSchema
>;

export const updateCorrespondenceTypeSchema = createCorrespondenceTypeSchema
    .omit({ code: true })
    .partial();
export type UpdateCorrespondenceTypeInput = z.infer<
    typeof updateCorrespondenceTypeSchema
>;
