import { z } from "zod";

const complaintTypeDefinitionBaseSchema = z.object({
    key: z
        .string()
        .trim()
        .min(2, "Mã loại phản ánh quá ngắn")
        .max(50)
        .regex(
            /^[a-z][a-z0-9_]*$/,
            "Mã chỉ gồm chữ thường, số và gạch dưới",
        ),
    name: z.string().trim().min(1, "Thiếu tên loại phản ánh").max(150),
    description: z.string().trim().max(1000).optional(),
    // Thu tu mang the hien uu tien dieu huong (xem
    // resolveComplaintTypeRecipientIds) - khong sap xep lai o day.
    allowedReceiverRoles: z.array(z.string()).min(1),
    active: z.boolean().default(true),
});

export const createComplaintTypeDefinitionSchema =
    complaintTypeDefinitionBaseSchema;
export type CreateComplaintTypeDefinitionInput = z.infer<
    typeof createComplaintTypeDefinitionSchema
>;

export const updateComplaintTypeDefinitionSchema =
    complaintTypeDefinitionBaseSchema.omit({ key: true }).partial();
export type UpdateComplaintTypeDefinitionInput = z.infer<
    typeof updateComplaintTypeDefinitionSchema
>;
