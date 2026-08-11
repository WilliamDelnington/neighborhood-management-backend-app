import { z } from "zod";
import { ORGANIZATION_REPRESENTATIVE_ROLES } from "@/types";

export const addOrganizationRepresentativeSchema = z.object({
    userId: z.string().min(1),
    role: z.enum(ORGANIZATION_REPRESENTATIVE_ROLES),
    // Chuc danh tu do (vd "Giam doc") - mo ta them cho role, khong bat buoc.
    title: z.string().optional(),
    reason: z.string().optional(),
});
export type AddOrganizationRepresentativeInput = z.infer<
    typeof addOrganizationRepresentativeSchema
>;

export const endOrganizationRepresentativeSchema = z.object({
    reason: z.string().optional(),
});
export type EndOrganizationRepresentativeInput = z.infer<
    typeof endOrganizationRepresentativeSchema
>;

// note bat buoc khi tu choi, khong bat buoc khi xac thuc - giong quy uoc
// verifyHouseOwnershipSchema.
export const verifyOrganizationRepresentativeSchema = z
    .object({
        decision: z.enum(["verified", "rejected"]),
        note: z.string().optional(),
    })
    .refine(data => data.decision === "verified" || !!data.note?.trim(), {
        message: "Vui long nhap ly do khi tu choi",
        path: ["note"],
    });
export type VerifyOrganizationRepresentativeInput = z.infer<
    typeof verifyOrganizationRepresentativeSchema
>;
