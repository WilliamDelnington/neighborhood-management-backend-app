import { z } from "zod";
import { REQUEST_FORM_FIELD_TYPES } from "@/models/RequestTypeDefinition";

const fieldSchema = z
    .object({
        key: z
            .string()
            .trim()
            .min(1, "Thiếu mã trường")
            .regex(/^[a-z][a-z0-9_]*$/, "Mã trường không hợp lệ"),
        label: z.string().trim().min(1, "Thiếu tên trường"),
        type: z.enum(REQUEST_FORM_FIELD_TYPES),
        required: z.boolean().default(false),
        options: z.array(z.string().trim().min(1)).default([]),
        classification: z
            .enum(["internal", "personal", "sensitive"])
            .default("internal"),
    })
    .superRefine((field, ctx) => {
        if (
            (field.type === "single_select" || field.type === "multi_select") &&
            field.options.length === 0
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["options"],
                message: "Trường lựa chọn phải có ít nhất một giá trị",
            });
        }
    });

const requestTypeDefinitionBaseSchema = z.object({
        key: z
            .string()
            .trim()
            .min(2, "Mã loại nhiệm vụ quá ngắn")
            .max(50)
            .regex(
                /^[a-z][a-z0-9_]*$/,
                "Mã chỉ gồm chữ thường, số và gạch dưới",
            ),
        name: z.string().trim().min(1, "Thiếu tên loại nhiệm vụ").max(150),
        description: z.string().trim().max(1000).optional(),
        fields: z.array(fieldSchema).max(50).default([]),
        allowedSenderRoles: z.array(z.string()).min(1),
        allowedReceiverRoles: z.array(z.string()).min(1),
        dataEntryMode: z.enum(["sender", "recipient"]).default("recipient"),
        active: z.boolean().default(true),
    });

function ensureUniqueFieldKeys(
    fields: Array<{ key: string }> | undefined,
    ctx: z.RefinementCtx,
) {
        if (!fields) return;
        const keys = fields.map(field => field.key);
        if (new Set(keys).size !== keys.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["fields"],
                message: "Mã trường trong biểu mẫu không được trùng nhau",
            });
        }
}

export const createRequestTypeDefinitionSchema =
    requestTypeDefinitionBaseSchema.superRefine((data, ctx) =>
        ensureUniqueFieldKeys(data.fields, ctx),
    );

export type CreateRequestTypeDefinitionInput = z.infer<
    typeof createRequestTypeDefinitionSchema
>;

export const updateRequestTypeDefinitionSchema =
    requestTypeDefinitionBaseSchema
        .omit({ key: true })
        .partial()
        .superRefine((data, ctx) => ensureUniqueFieldKeys(data.fields, ctx));
export type UpdateRequestTypeDefinitionInput = z.infer<
    typeof updateRequestTypeDefinitionSchema
>;
