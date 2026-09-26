import { z } from "zod";
import { POI_CATEGORIES } from "@/models/Poi";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "ID không hợp lệ");

const poiObjectSchema = z.object({
    name: z.string().min(1, "Tên không được để trống"),
    category: z.enum(POI_CATEGORIES),
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
    // Nhap tay qua form thi coi la da xac minh luon - chi ket qua tu scan
    // (source="scan", set rieng trong service, khong nhan tu client) moi bat
    // buoc verified=false luc tao.
    verified: z.boolean().default(true),
    // Bat buoc khi category = "household" (xem refine ben duoi cua
    // createPoiSchema) - id Household duoc gan toa do nay.
    householdId: objectId.optional(),
});

export const createPoiSchema = poiObjectSchema.superRefine((input, ctx) => {
    if (input.category === "household" && !input.householdId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["householdId"],
            message: "Chọn hộ dân cần gắn cho điểm này",
        });
    }
});
export type CreatePoiInput = z.infer<typeof createPoiSchema>;

// Khong superRefine o day - cho phep sua rieng le vd chi doi lat/lng ma khong
// phai gui lai householdId/category.
export const updatePoiSchema = poiObjectSchema.partial();
export type UpdatePoiInput = z.infer<typeof updatePoiSchema>;
