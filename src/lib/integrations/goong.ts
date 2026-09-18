import { HttpError } from "@/lib/response";

/**
 * Wrapper server-side cho Goong Maps Platform (Place Autocomplete + Place
 * Detail + Geocode) - thay the Google Places API (New) vi Goong cho ket qua
 * dia chi Viet Nam sai lech rat nho so voi Google nhung khong ton phi. Khoa
 * API luon doc server-side, KHONG BAO GIO tra ve cho client - frontend chi
 * goi qua 3 route trong app/api/houses/geo/{autocomplete,place-details,geocode}.
 *
 * Khong con proxy Static Map o day - Goong REST API chi co /staticmap/route
 * (ve duong di giua 2 diem xuat phat/den), khong co endpoint anh tinh theo
 * center+zoom+kich thuoc nhu Google Static Maps truoc day. Buoc xac nhan pin
 * (StaticMapPinConfirm.tsx o resident-web-app) da chuyen sang goi thang Goong
 * Map Tiles tu client bang MapLibre (can VITE_GOONG_MAP_KEY - mot Map Key
 * rieng, khac GOONG_API_KEY o day).
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
    // Tach rieng ten dia diem (in dam) va dia chi day du (mau xam) de UI hien
    // thi giong Goong Maps/Google Maps that - fallback ve description neu
    // Goong khong tra ve structured_formatting cho ket qua nao do.
    mainText: string;
    secondaryText: string;
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
    // Uu tien ket qua gan toa do nay (vd tam Phuong) - Goong chi dung de XEP
    // HANG ket qua gan hon len truoc, KHONG loc cung theo ban kinh cu the nhu
    // Google Places Nearby Search (Goong khong co API dang do, xem
    // searchPlacesByCategory ben duoi).
    location?: { lat: number; lng: number },
): Promise<PlaceAutocompletePrediction[]> {
    const apiKey = getGoongServerApiKey();
    const url = new URL("https://rsapi.goong.io/place/autocomplete");
    url.searchParams.set("input", input);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("sessiontoken", sessionToken);
    if (location) {
        url.searchParams.set("location", `${location.lat},${location.lng}`);
    }
    const res = await fetch(url);
    if (!res.ok) {
        throw new HttpError("Khong the tra cuu dia chi luc nay", 502);
    }
    const data = (await res.json()) as {
        predictions?: Array<{
            place_id: string;
            description?: string;
            structured_formatting?: {
                main_text?: string;
                secondary_text?: string;
            };
        }>;
    };
    return (data.predictions || []).map(p => {
        const description = p.description || "";
        const commaIndex = description.indexOf(",");
        return {
            placeId: p.place_id,
            text: description,
            mainText:
                p.structured_formatting?.main_text ||
                (commaIndex >= 0 ? description.slice(0, commaIndex) : description),
            secondaryText:
                p.structured_formatting?.secondary_text ||
                (commaIndex >= 0 ? description.slice(commaIndex + 1).trim() : ""),
        };
    });
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

export interface CategoryPlaceResult {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
}

export interface LatLngBoundsInput {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
}

/**
 * XAP XI mot "tim theo danh muc" (vd "Chung cư", "Trạm y tế" quanh mot khu
 * vuc) - Goong KHONG co API rieng cho viec nay (khac Google Places Nearby
 * Search co tham so "type"), nen chi con cach goi Autocomplete voi tu khoa dai
 * dien cho danh muc (vd "Trạm y tế Phường Dương Nội") uu tien theo `location`,
 * roi goi Place Detail cho TUNG ket qua de lay toa do. Chat luong phu thuoc
 * hoan toan vao Autocomplete cua Goong co "hieu" tu khoa hay khong - co the
 * thieu/sai so voi tim dung theo danh muc that, va so luong ket qua bi gioi
 * han theo so goi y Autocomplete tra ve (thuong ${"<="} 5).
 *
 * `location` cua Goong CHI dung de UU TIEN xep hang ket qua gan hon, KHONG
 * phai bo loc ban kinh cung - neu tu khoa khop yeu trong khu vuc, Goong van co
 * the tra ve ket qua o rat xa (vd "cây xăng" khop mot cay xang khac tinh).
 * Truyen them `bounds` (bbox Phuong, dung chung voi maxBounds cua ban do) de
 * loai bo cung cac ket qua nam ngoai khu vuc quan ly truoc khi tra ve.
 */
export async function searchPlacesByCategory(
    keyword: string,
    location: { lat: number; lng: number },
    bounds?: LatLngBoundsInput,
): Promise<CategoryPlaceResult[]> {
    const sessionToken = `category-search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const predictions = await autocompletePlaces(keyword, sessionToken, location);

    const details = await Promise.all(
        predictions.map(async prediction => {
            try {
                const detail = await getPlaceDetails(prediction.placeId, sessionToken);
                if (
                    bounds &&
                    (detail.lat < bounds.minLat ||
                        detail.lat > bounds.maxLat ||
                        detail.lng < bounds.minLng ||
                        detail.lng > bounds.maxLng)
                ) {
                    return null;
                }
                return {
                    placeId: prediction.placeId,
                    name: prediction.mainText,
                    address: detail.formattedAddress || prediction.secondaryText,
                    lat: detail.lat,
                    lng: detail.lng,
                };
            } catch {
                return null;
            }
        }),
    );

    return details.filter((item): item is CategoryPlaceResult => item !== null);
}

/**
 * Geocode mot lan (dia chi day du -> toa do), KHONG qua Autocomplete/Place
 * Detail - dung khi da co san dia chi day du, khong mo hon (so nha + duong +
 * phuong/xa + tinh/thanh, xem HouseForm.tsx ghep tu Street + Neighborhood da
 * chon), nen khong can nguoi dung go va chon tu danh sach goi y. Tra ve KET
 * QUA DAU TIEN trong results - Goong khong co status rieng cho "khong tim
 * thay", chi tra ve results rong (xem
 * https://help.goong.io/kb/rest-api/geocode/geocodeding-ma-hoa-dia-ly/).
 */
export async function geocodeAddress(
    address: string,
): Promise<PlaceDetailsResult> {
    const apiKey = getGoongServerApiKey();
    const url = new URL("https://rsapi.goong.io/geocode");
    url.searchParams.set("address", address);
    url.searchParams.set("api_key", apiKey);
    const res = await fetch(url);
    if (!res.ok) {
        throw new HttpError("Khong the xac dinh toa do luc nay", 502);
    }
    const data = (await res.json()) as {
        results?: Array<{
            geometry?: { location?: { lat: number; lng: number } };
            formatted_address?: string;
        }>;
    };
    const first = data.results?.[0];
    if (!first?.geometry?.location) {
        throw new HttpError("Khong tim thay toa do cho dia chi nay", 404);
    }
    return {
        lat: first.geometry.location.lat,
        lng: first.geometry.location.lng,
        formattedAddress: first.formatted_address || "",
    };
}
