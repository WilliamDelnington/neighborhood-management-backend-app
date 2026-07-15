import { z } from "zod";
import { NHOM_PHAN_ANH } from "@/types";
import { ALL_PERMISSION_KEYS } from "@/config/permissions";

const ROLE_KEY_REGEX = /^[a-z][a-z0-9_]{1,49}$/;

const validPermissionList = (perms: string[]) =>
    perms.every(p => ALL_PERMISSION_KEYS.has(p));

const allowedComplaintCategoriesSchema = z
    .array(z.enum(NHOM_PHAN_ANH))
    .nullable()
    .optional();

export const createRoleSchema = z.object({
    key: z
        .string()
        .regex(
            ROLE_KEY_REGEX,
            "Key chi gom chu thuong, so, gach duoi, bat dau bang chu cai",
        ),
    name: z.string().min(1, "Thieu ten vai tro"),
    description: z.string().optional(),
    permissions: z
        .array(z.string())
        .default([])
        .refine(validPermissionList, "Danh sach permissions co gia tri khong hop le"),
    allowedComplaintCategories: allowedComplaintCategoriesSchema,
    active: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    permissions: z
        .array(z.string())
        .refine(validPermissionList, "Danh sach permissions co gia tri khong hop le")
        .optional(),
    allowedComplaintCategories: allowedComplaintCategoriesSchema,
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
