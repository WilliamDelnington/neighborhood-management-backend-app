import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireAnyPermission } from "@/lib/rbac";
import { updateNeighborhoodGeometrySchema } from "@/validators/neighborhood";
import {
    getNeighborhoodById,
    updateNeighborhood,
} from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/neighborhoods/:id/geometry
 * Endpoint hep cho module "Bản đồ ranh giới Tổ dân phố" o Dashboard
 * (NeighborhoodZonesMap.tsx) - chi sua boundaryType/geometry, KHONG mo quyen
 * sua ten/dia chi/gan to truong... nhu neighborhoods.manage. Giong quy uoc cua
 * PATCH /api/houses/:id/gis (houses.update_gis). Chap nhan CA HAI permission
 * (neighborhoods.manage HOAC neighborhoods.update_gis) - manage la quyen rong
 * hon nen mac nhien bao gom duoc quyen hep nay.
 */
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requireAnyPermission(user, [
            "neighborhoods.manage",
            "neighborhoods.update_gis",
        ]);

        // Cung kiem tra pham vi (wardCode/to phu trach) nhu GET - dam bao
        // nguoi chi co quyen nay khong the sua ranh gioi to ngoai pham vi.
        await getNeighborhoodById(params.id, user);

        const body = updateNeighborhoodGeometrySchema.parse(await req.json());
        const neighborhood = await updateNeighborhood(
            String(user._id),
            params.id,
            body,
        );
        return apiSuccess(neighborhood, "Cập nhật ranh giới bản đồ thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
