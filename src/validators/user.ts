import { z } from "zod";
import { USER_STATUS } from "@/types";
import { phoneRegisterSchema } from "@/validators/auth";

// Nhan vien (to truong/admin) tao tai khoan chu ho thay - cung dinh dang voi
// registerWithPhone (phone+password tu dang ky), chi khac o cho ai la actor
// va co them dia chi tuy chon (xem userService.createHouseOwnerByStaff).
export const createHouseOwnerSchema = phoneRegisterSchema.extend({
    address: z.string().optional(),
});
export type CreateHouseOwnerInput = z.infer<typeof createHouseOwnerSchema>;

export const updateUserSchema = z.object({
    displayName: z.string().min(1).optional(),
    phone: z.string().optional(),
    status: z.enum(USER_STATUS).optional(),
    householdId: z.string().nullable().optional(),
    citizenId: z.string().nullable().optional(),
    assignedClusters: z.array(z.string()).optional(),
    // Vai tro la du lieu dong - tinh hop le (ton tai, active) duoc kiem tra
    // trong updateUserByAdmin, khong con the kiem bang z.enum tinh.
    primaryRole: z.string().min(1).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const assignRoleSchema = z.object({
    userId: z.string().min(1),
    role: z.string().min(1),
    scopeType: z
        .enum(["all", "cluster", "household", "complaint", "module"])
        .default("all"),
    scopeValues: z.array(z.string()).default([]),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const revokeRoleSchema = z.object({
    userId: z.string().min(1),
    role: z.string().min(1),
});
export type RevokeRoleInput = z.infer<typeof revokeRoleSchema>;
