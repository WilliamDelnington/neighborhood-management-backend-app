import { z } from "zod";

// scopeId la Mixed o model (wardCode la number, neighborhoodId la string) -
// chap nhan ca hai, ep kieu cu the trong service dua theo scopeType.
const scopeIdField = z.union([z.string().min(1), z.number()]);

export const assignScopeSchema = z.object({
    userId: z.string().min(1, "Thiếu tài khoản"),
    roleKey: z.string().min(1, "Thiếu vai trò"),
    scopeType: z.enum(["WARD", "NEIGHBORHOOD"]),
    scopeId: scopeIdField,
    note: z.string().optional(),
});
export type AssignScopeInput = z.infer<typeof assignScopeSchema>;

export const unassignScopeSchema = z.object({
    userId: z.string().min(1, "Thiếu tài khoản"),
    roleKey: z.string().min(1, "Thiếu vai trò"),
    scopeType: z.enum(["WARD", "NEIGHBORHOOD"]),
    scopeId: scopeIdField,
    note: z.string().optional(),
});
export type UnassignScopeInput = z.infer<typeof unassignScopeSchema>;
