import { z } from "zod";
import { LOAI_SO_HUU } from "@/types";

export const createHouseholdSchema = z.object({
    cluster: z.string().min(1, "Cum dan cu khong duoc de trong"),
    address: z.string().min(1, "Dia chi khong duoc de trong"),
    headOfHousehold: z.string().min(1, "Ten chu ho khong duoc de trong"),
    phone: z.string().optional(),
    memberCount: z.number().int().min(0).default(0),
    ownershipType: z.enum(LOAI_SO_HUU).default("chinh_chu"),
    needsSupport: z.boolean().default(false),
    note: z.string().optional(),
});
export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

export const updateHouseholdSchema = createHouseholdSchema.partial();
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;
