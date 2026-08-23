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

// Zoom gioi han 17-19: du chi tiet de xac nhan/keo pin trong ngo/hem nhung
// khong qua sat khien anh mat dinh huong khu vuc xung quanh.
export const geoStaticMapSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    zoom: z.number().int().min(17).max(19).optional().default(18),
});
export type GeoStaticMapInput = z.infer<typeof geoStaticMapSchema>;
