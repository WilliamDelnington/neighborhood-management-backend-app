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

export const updateUserSchema = z
    .object({
        displayName: z.string().min(1).optional(),
        phone: z.string().optional(),
        status: z.enum(USER_STATUS).optional(),
        // Bat buoc khi doi status (khoa/mo tai khoan) - xem refine ben duoi.
        // Khong dung cho cac lan cap nhat khac (doi ten, gan cum...).
        statusReason: z.string().optional(),
        householdId: z.string().nullable().optional(),
        citizenId: z.string().nullable().optional(),
        assignedClusters: z.array(z.string()).optional(),
        // Vai tro la du lieu dong - tinh hop le (ton tai, active) duoc kiem tra
        // trong updateUserByAdmin, khong con the kiem bang z.enum tinh.
        primaryRole: z.string().min(1).optional(),
    })
    .refine(data => data.status === undefined || !!data.statusReason?.trim(), {
        message: "Vui long nhap ly do khi khoa/mo tai khoan",
        path: ["statusReason"],
    });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// Dung cho endpoint khoa/mo tai khoan rieng (users.lock) - hep hon
// updateUserSchema: chi status + ly do bat buoc, khong cho sua truong nao
// khac (xem userService.lockUserStatus).
export const lockUserStatusSchema = z.object({
    status: z.enum(["active", "locked"]),
    statusReason: z.string().min(1, "Vui long nhap ly do khoa/mo tai khoan"),
});
export type LockUserStatusInput = z.infer<typeof lockUserStatusSchema>;

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
