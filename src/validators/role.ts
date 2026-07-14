import { z } from "zod";
import { isValidPermissionKey } from "@/lib/permissionRegistry";
import { NHOM_PHAN_ANH } from "@/types";

const permissionsField = z
    .array(z.string())
    .default([])
    .refine(
        permissions => permissions.every(isValidPermissionKey),
        "Danh sach permission chua key khong hop le",
    );

const complaintCategoriesField = z.array(z.enum(NHOM_PHAN_ANH));

export const createRoleSchema = z.object({
    key: z
        .string()
        .min(2, "Key qua ngan")
        .regex(
            /^[a-z][a-z0-9_]*$/,
            "Key chi gom chu thuong, so va gach duoi, bat dau bang chu",
        ),
    name: z.string().min(1, "Thieu ten vai tro"),
    description: z.string().optional(),
    permissions: permissionsField,
    // Bo trong = khong gioi han (xem tat ca nhom phan anh).
    allowedComplaintCategories: complaintCategoriesField.optional(),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
    name: z.string().min(1, "Thieu ten vai tro").optional(),
    description: z.string().optional(),
    permissions: permissionsField.optional(),
    // undefined = khong doi, null = go gioi han (xem tat ca), mang = chot gioi han.
    allowedComplaintCategories: complaintCategoriesField.nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
