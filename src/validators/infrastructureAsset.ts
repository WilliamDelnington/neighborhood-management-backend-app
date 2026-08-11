import { z } from "zod";
import {
    INFRASTRUCTURE_ASSET_CONDITIONS,
    INFRASTRUCTURE_ASSET_TYPES,
} from "@/types";

export const createInfrastructureAssetSchema = z.object({
    name: z.string().min(1, "Thieu ten tai san"),
    type: z.enum(INFRASTRUCTURE_ASSET_TYPES),
    neighborhoodId: z.string().min(1, "Thieu to dan pho"),
    location: z.string().optional(),
    condition: z.enum(INFRASTRUCTURE_ASSET_CONDITIONS).default("binh_thuong"),
    note: z.string().optional(),
});
export type CreateInfrastructureAssetInput = z.infer<
    typeof createInfrastructureAssetSchema
>;

export const updateInfrastructureAssetSchema = createInfrastructureAssetSchema
    .omit({ neighborhoodId: true })
    .partial();
export type UpdateInfrastructureAssetInput = z.infer<
    typeof updateInfrastructureAssetSchema
>;
