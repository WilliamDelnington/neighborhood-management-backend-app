import { HttpError } from "@/lib/response";

/**
 * Wrapper server-side cho Goong Maps Platform (Place Autocomplete + Place
 * Detail) - thay the Google Places API (New) vi Goong cho ket qua dia chi
 * Viet Nam sai lech rat nho so voi Google nhung khong ton phi. Khoa API luon
 * doc server-side, KHONG BAO GIO tra ve cho client - frontend chi goi qua 2
 * route trong app/api/houses/geo/{autocomplete,place-details}.
 *
 * Static Map van dung Google (xem googleMaps.ts) - Goong REST API chi co
 * /staticmap/route (ve duong di giua 2 diem xuat phat/den), khong co endpoint
 * anh tinh theo center+zoom+kich thuoc nhu Google Static Maps ma
 * StaticMapPinConfirm.tsx can.
 *
 * Ham doc process.env moi lan goi (khong phai hang so top-level), giong quy
 * uoc trong lib/config.ts, de test co the doi env giua cac test case.
 */
export function getGoongServerApiKey(): string {
    const key = process.env.GOONG_API_KEY;
    if (!key) {
        throw new HttpError("Chua cau hinh GOONG_API_KEY o server", 503);
    }
    return key;
}

export interface PlaceAutocompletePrediction {
    placeId: string;
    text: string;
}

/**
 * Place Autocomplete. sessionToken duoc client sinh mot lan cho ca chuoi "go
 * tim -> chon ket qua" (xem HouseLocationPicker) - Goong khong tinh phi theo
 * session nhu Google nhung van gui kem sessiontoken de giu nguyen hop dong
 * API voi client. Xem
 * https://help.goong.io/kb/rest-api/autocomplete/autocomplete-tu-dong-hoan-thanh-dia-diem/
 */
export async function autocompletePlaces(
    input: string,
    sessionToken: string,
): Promise<PlaceAutocompletePrediction[]> {
    const apiKey = getGoongServerApiKey();
    const url = new URL("https://rsapi.goong.io/place/autocomplete");
    url.searchParams.set("input", input);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("sessiontoken", sessionToken);
    const res = await fetch(url);
    if (!res.ok) {
        throw new HttpError("Khong the tra cuu dia chi luc nay", 502);
    }
    const data = (await res.json()) as {
        predictions?: Array<{ place_id: string; description?: string }>;
    };
    return (data.predictions || []).map(p => ({
        placeId: p.place_id,
        text: p.description || "",
    }));
}

export interface PlaceDetailsResult {
    lat: number;
    lng: number;
    formattedAddress: string;
}

/** Place Detail - tra ve toa do + dia chi day du cho placeId da chon o Autocomplete. */
export async function getPlaceDetails(
    placeId: string,
    sessionToken: string,
): Promise<PlaceDetailsResult> {
    const apiKey = getGoongServerApiKey();
    const url = new URL("https://rsapi.goong.io/place/detail");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("sessiontoken", sessionToken);
    const res = await fetch(url);
    if (!res.ok) {
        throw new HttpError("Khong the lay chi tiet dia chi luc nay", 502);
    }
    const data = (await res.json()) as {
        result?: {
            geometry?: { location?: { lat: number; lng: number } };
            formatted_address?: string;
        };
    };
    if (!data.result?.geometry?.location) {
        throw new HttpError("Dia chi khong co toa do", 502);
    }
    return {
        lat: data.result.geometry.location.lat,
        lng: data.result.geometry.location.lng,
        formattedAddress: data.result.formatted_address || "",
    };
}
