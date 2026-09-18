import { z } from "zod";
import { NEIGHBORHOOD_COLLABORATOR_SCOPES } from "@/models/NeighborhoodCollaboratorAssignment";

// scopeId la Mixed o model (wardCode la number, neighborhoodId la string) -
// chap nhan ca hai, ep kieu cu the trong service dua theo scopeType.
const scopeIdField = z.union([z.string().min(1), z.number()]);

// Chi co y nghia voi scopeType="NEIGHBORHOOD" va vai tro can pham vi con hep
// hon ca to (giong Cong tac vien) - xem ScopeAssignment.subScope. Tuy chon,
// dung boi nhanh "vai tro khac" trong NeighborhoodMembersPanel.tsx (3 vai tro
// da biet van di qua assignNeighborhoodLeader/Coleader/Collaborator rieng,
// khong qua endpoint nay).
const subScopeField = z
    .object({
        kind: z.enum(NEIGHBORHOOD_COLLABORATOR_SCOPES),
        streetId: z.string().optional(),
        houseIds: z.array(z.string()).optional(),
        campaignId: z.string().optional(),
    })
    .optional();

export const assignScopeSchema = z.object({
    userId: z.string().min(1, "Thiếu tài khoản"),
    roleKey: z.string().min(1, "Thiếu vai trò"),
    scopeType: z.enum(["WARD", "NEIGHBORHOOD"]),
    scopeId: scopeIdField,
    subScope: subScopeField,
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
