import { z } from "zod";
import { ROLES, USER_STATUS } from "@/types";

export const updateUserSchema = z.object({
    displayName: z.string().min(1).optional(),
    phone: z.string().optional(),
    status: z.enum(USER_STATUS).optional(),
    householdId: z.string().nullable().optional(),
    citizenId: z.string().nullable().optional(),
    assignedClusters: z.array(z.string()).optional(),
    primaryRole: z.enum(ROLES).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const assignRoleSchema = z.object({
    userId: z.string().min(1),
    role: z.enum(ROLES),
    scopeType: z
        .enum(["all", "cluster", "household", "complaint", "module"])
        .default("all"),
    scopeValues: z.array(z.string()).default([]),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
