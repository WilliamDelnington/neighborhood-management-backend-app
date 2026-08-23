import { connectDB } from "@/lib/mongodb";
import { requireAnyPermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { fetchStaticMapBase64 } from "@/lib/integrations/googleMaps";
import { geoStaticMapSchema } from "@/validators/googleMapsGeo";

export const dynamic = "force-dynamic";

// Kich thuoc co dinh cho anh xac nhan pin - du lon de thao tac keo tren dien
// thoai, khong doi giua cac lan goi de cong thuc pixel<->latlng phia client
// (StaticMapPinConfirm.tsx) luon dung mot gia tri worldSize/kich thuoc man hinh.
const STATIC_MAP_WIDTH = 640;
const STATIC_MAP_HEIGHT = 400;

/**
 * POST /api/houses/geo/static-map
 * Tra ve DUY NHAT 1 anh (khong bake san marker) de client tu ve pin co the
 * keo de dieu chinh - xem StaticMapPinConfirm.tsx. Goi mot lan cho ca phien
 * xac nhan, khong goi lai khi nguoi dung keo pin (tinh lai lat/lng hoan toan
 * o client bang phep chieu Web Mercator).
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requireAnyPermission(actorUser, [
            "houses.create",
            "houses.update",
            "houses.update_gis",
        ]);
        const input = geoStaticMapSchema.parse(await req.json());
        const image = await fetchStaticMapBase64({
            lat: input.lat,
            lng: input.lng,
            zoom: input.zoom,
            width: STATIC_MAP_WIDTH,
            height: STATIC_MAP_HEIGHT,
        });
        return apiSuccess({
            ...image,
            width: STATIC_MAP_WIDTH,
            height: STATIC_MAP_HEIGHT,
            zoom: input.zoom,
            centerLat: input.lat,
            centerLng: input.lng,
        });
    } catch (err) {
        return apiErrorFromException(err);
    }
}
