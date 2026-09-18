import { z } from "zod";

export const categoryPlaceSearchSchema = z.object({
    keyword: z.string().min(1, "Thieu tu khoa tim kiem"),
    lat: z.number(),
    lng: z.number(),
    // Bbox tuy chon (vd bien Phuong) - loai bo ket qua Autocomplete nam ngoai
    // khu vuc quan ly truoc khi tra ve (xem searchPlacesByCategory).
    bounds: z
        .object({
            minLat: z.number(),
            minLng: z.number(),
            maxLat: z.number(),
            maxLng: z.number(),
        })
        .optional(),
});
export type CategoryPlaceSearchInput = z.infer<typeof categoryPlaceSearchSchema>;
