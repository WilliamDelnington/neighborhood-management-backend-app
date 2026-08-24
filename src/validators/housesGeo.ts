import { z } from "zod";

export const geoAutocompleteSchema = z.object({
    input: z.string().min(1, "Thieu noi dung tim kiem"),
    sessionToken: z.string().min(1, "Thieu sessionToken"),
});
export type GeoAutocompleteInput = z.infer<typeof geoAutocompleteSchema>;

export const geoPlaceDetailsSchema = z.object({
    placeId: z.string().min(1, "Thieu placeId"),
    sessionToken: z.string().min(1, "Thieu sessionToken"),
});
export type GeoPlaceDetailsInput = z.infer<typeof geoPlaceDetailsSchema>;
