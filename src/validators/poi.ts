import { z } from "zod";
import { POI_CATEGORIES } from "@/models/Poi";

export const createPoiSchema = z.object({
    name: z.string().min(1, "Tên không được để trống"),
    category: z.enum(POI_CATEGORIES),
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
    // Nhap tay qua form thi coi la da xac minh luon - chi ket qua tu scan
    // (source="scan", set rieng trong service, khong nhan tu client) moi bat
    // buoc verified=false luc tao.
    verified: z.boolean().default(true),
});
export type CreatePoiInput = z.infer<typeof createPoiSchema>;

export const updatePoiSchema = createPoiSchema.partial();
export type UpdatePoiInput = z.infer<typeof updatePoiSchema>;
