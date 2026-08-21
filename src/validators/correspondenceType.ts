import { z } from "zod";

export const createCorrespondenceTypeSchema = z.object({
    name: z.string().min(1, "Tên loại văn bản không được để trống"),
    code: z.string().min(1, "Mã loại văn bản không được để trống"),
    description: z.string().optional(),
    allowedSenderRoles: z.array(z.string()).min(1, "Chọn ít nhất một vai trò người gửi"),
    allowedReceiverRoles: z
        .array(z.string())
        .min(1, "Chọn ít nhất một vai trò người nhận"),
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
