import { z } from "zod";
import { isValidPermissionKey } from "@/lib/permissionRegistry";

const permissionsField = z
    .array(z.string())
    .default([])
    .refine(
        permissions => permissions.every(isValidPermissionKey),
        "Danh sách permission chứa key không hợp lệ",
    );

// Truoc la z.array(z.enum(NHOM_PHAN_ANH)) (danh sach tinh) - nay category la
// key cua ComplaintTypeDefinition (danh muc quan tri duoc, co the la danh
// muc tuy chinh do admin tao sau nay), nen chuyen sang permissive regex-string
// cung quy uoc voi requestTypesField ben duoi.
const complaintCategoriesField = z.array(
    z.string().regex(/^[a-z][a-z0-9_]*$/, "Nhóm phản ánh không hợp lệ"),
);
const requestTypesField = z.array(
    z.string().regex(/^[a-z][a-z0-9_]*$/, "Loại yêu cầu không hợp lệ"),
);

export const createRoleSchema = z.object({
    key: z
        .string()
        .min(2, "Key quá ngắn")
        .regex(
            /^[a-z][a-z0-9_]*$/,
            "Key chỉ gồm chữ thường, số và gạch dưới, bắt đầu bằng chữ",
        ),
    name: z.string().min(1, "Thiếu tên vai trò"),
    description: z.string().optional(),
    permissions: permissionsField,
    // Bo trong = khong gioi han (xem tat ca nhom phan anh).
    allowedComplaintCategories: complaintCategoriesField.optional(),
    // Bo trong = khong gioi han (gui duoc tat ca loai yeu cau).
    allowedRequestTypes: requestTypesField.optional(),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
    name: z.string().min(1, "Thiếu tên vai trò").optional(),
    description: z.string().optional(),
    permissions: permissionsField.optional(),
    // undefined = khong doi, null = go gioi han (xem tat ca), mang = chot gioi han.
    allowedComplaintCategories: complaintCategoriesField.nullable().optional(),
    allowedRequestTypes: requestTypesField.nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
