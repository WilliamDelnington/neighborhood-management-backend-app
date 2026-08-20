import { HttpError } from "@/lib/response";

/**
 * Wrapper server-side cho Google Maps Platform (Places Autocomplete/Details
 * moi + Static Maps). KHONG implement IntegrationAdapter (contracts.ts) - do
 * la contract danh cho adapter chinh phu (vneid/lgsp/ndxp...), con day chi la
 * mot proxy REST don gian. Khoa API luon doc server-side, KHONG BAO GIO tra ve
 * cho client - frontend chi goi qua 3 route trong app/api/houses/geo/*.
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

export interface PlaceAutocompletePrediction {
    placeId: string;
    text: string;
}

/**
 * Places Autocomplete (New). sessionToken duoc client sinh mot lan cho ca
 * chuoi "go tim -> chon ket qua" (xem HouseLocationPicker) - Google chi tinh
 * phi Place Details khi dung chung sessionToken voi Autocomplete, ban than
 * Autocomplete la mien phi. Xem
 * https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
 */
export async function autocompletePlaces(
    input: string,
    sessionToken: string,
): Promise<PlaceAutocompletePrediction[]> {
    const apiKey = getGoogleMapsServerApiKey();
    const res = await fetch(
        "https://places.googleapis.com/v1/places:autocomplete",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask":
                    "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
            },
            body: JSON.stringify({
                input,
                sessionToken,
                regionCode: "VN",
                languageCode: "vi",
            }),
        },
    );
    if (!res.ok) {
        throw new HttpError("Khong the tra cuu dia chi luc nay", 502);
    }
    const data = (await res.json()) as {
        suggestions?: Array<{
            placePrediction?: { placeId: string; text?: { text: string } };
        }>;
    };
    return (data.suggestions || [])
        .map(s => s.placePrediction)
        .filter((p): p is { placeId: string; text?: { text: string } } => !!p)
        .map(p => ({ placeId: p.placeId, text: p.text?.text || "" }));
}

export interface PlaceDetailsResult {
    lat: number;
    lng: number;
    formattedAddress: string;
}

/** Place Details (New) - dung chung sessionToken voi lan Autocomplete tuong ung. */
export async function getPlaceDetails(
    placeId: string,
    sessionToken: string,
): Promise<PlaceDetailsResult> {
    const apiKey = getGoogleMapsServerApiKey();
    const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
    url.searchParams.set("sessionToken", sessionToken);
    const res = await fetch(url, {
        headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "location,formattedAddress",
        },
    });
    if (!res.ok) {
        throw new HttpError("Khong the lay chi tiet dia chi luc nay", 502);
    }
    const data = (await res.json()) as {
        location?: { latitude: number; longitude: number };
        formattedAddress?: string;
    };
    if (!data.location) {
        throw new HttpError("Dia chi khong co toa do", 502);
    }
    return {
        lat: data.location.latitude,
        lng: data.location.longitude,
        formattedAddress: data.formattedAddress || "",
    };
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
