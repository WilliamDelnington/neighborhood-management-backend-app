import { HttpError } from "@/lib/response";

/**
 * Wrapper server-side cho Google Maps Static API. KHONG implement
 * IntegrationAdapter (contracts.ts) - do la contract danh cho adapter chinh
 * phu (vneid/lgsp/ndxp...), con day chi la mot proxy REST don gian. Khoa API
 * luon doc server-side, KHONG BAO GIO tra ve cho client - frontend chi goi
 * qua route app/api/houses/geo/static-map.
 *
 * Places Autocomplete/Detail da chuyen sang Goong (xem goong.ts) vi khong ton
 * phi va sai lech toa do rat nho voi dia chi Viet Nam. Rieng Static Map van
 * giu Google vi Goong REST API khong co endpoint anh tinh theo center+zoom
 * ma StaticMapPinConfirm.tsx can (Goong chi co /staticmap/route ve duong di
 * giua 2 diem).
 *
 * Ham doc process.env moi lan goi (khong phai hang so top-level), giong quy
 * uoc trong lib/config.ts, de test co the doi env giua cac test case.
 */
export function getGoogleMapsServerApiKey(): string {
    const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!key) {
        throw new HttpError(
            "Chua cau hinh GOOGLE_MAPS_SERVER_API_KEY o server",
            503,
        );
    }
    return key;
}

export interface StaticMapImage {
    base64: string;
    mimeType: "image/png";
}

/**
 * Static Maps - luon goi voi scale=1 (tranh phai chia lai he so scale trong
 * toan pixel<->latlng phia client o StaticMapPinConfirm.tsx, day la nguon loi
 * de gay ra neu dung scale=2). KHONG bake san marker vao anh - diem giua anh
 * (center) chinh la toa do ban dau, client tu ve mot pin overlay co the keo
 * duoc de dieu chinh (xem StaticMapPinConfirm.tsx); neu bake san marker o day
 * se bi hien thi trung 2 pin (mot tinh, mot keo duoc). Tra ve base64 trong
 * JSON (khong stream binary truc tiep) de khop voi apiSuccess envelope dung
 * chung toan bo API - codebase nay chua co tien le tra ve response nhi phan
 * qua route.
 */
export async function fetchStaticMapBase64(params: {
    lat: number;
    lng: number;
    zoom: number;
    width: number;
    height: number;
}): Promise<StaticMapImage> {
    const apiKey = getGoogleMapsServerApiKey();
    const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
    url.searchParams.set("center", `${params.lat},${params.lng}`);
    url.searchParams.set("zoom", String(params.zoom));
    url.searchParams.set("size", `${params.width}x${params.height}`);
    url.searchParams.set("scale", "1");
    url.searchParams.set("key", apiKey);
    const res = await fetch(url);
    if (!res.ok) {
        throw new HttpError("Khong the tai anh ban do luc nay", 502);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64: buffer.toString("base64"), mimeType: "image/png" };
}
