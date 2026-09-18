import { Poi, type PoiCategory } from "@/models";
import { HttpError } from "@/lib/response";
import { searchPlacesByCategory } from "@/lib/integrations/goong";
import { isPointInWardBoundary } from "@/lib/wardBoundary";
import { POI_CATEGORY_META } from "@/lib/poiCategories";
import type { CreatePoiInput, UpdatePoiInput } from "@/validators/poi";

export async function listPois(params: {
    category?: PoiCategory;
    verified?: boolean;
}) {
    const filter: Record<string, unknown> = {};
    if (params.category) filter.category = params.category;
    if (params.verified !== undefined) filter.verified = params.verified;
    return Poi.find(filter).sort({ category: 1, name: 1 });
}

export async function getPoiById(id: string) {
    const poi = await Poi.findById(id);
    if (!poi) throw new HttpError("Không tìm thấy điểm tiện ích", 404);
    return poi;
}

export async function createPoi(actorId: string, input: CreatePoiInput) {
    return Poi.create({
        ...input,
        source: "manual",
        createdBy: actorId,
        updatedBy: actorId,
    });
}

export async function updatePoi(
    actorId: string,
    id: string,
    input: UpdatePoiInput,
) {
    const poi = await getPoiById(id);
    Object.assign(poi, input);
    poi.updatedBy = actorId as never;
    await poi.save();
    return poi;
}

export async function deletePoi(id: string) {
    const poi = await getPoiById(id);
    await poi.deleteOne();
}

export interface ScanPoisResult {
    category: PoiCategory;
    label: string;
    created: number;
    skippedExisting: number;
}

/**
 * Quet tat ca danh muc mot lan (goi Goong Autocomplete xap xi, xem
 * lib/integrations/goong.ts) - luon tao voi verified=false, KHONG BAO GIO ghi
 * de len ban ghi da co san (kha nang trung placeId khong dang tin cay o day vi
 * Goong khong tra ve placeId on dinh qua nhieu lan quet, nen chi khu trung
 * THO theo ten+toa do gan giong, tranh tao trung neu admin bam quet nhieu
 * lan). Admin BAT BUOC phai vao trang "Điểm tiện ích" xem lai/xoa ket qua sai
 * truoc khi tin - day chi la goi y ban dau, khong phai du lieu chinh thuc.
 */
export async function scanPois(
    actorId: string,
    center: { lat: number; lng: number },
): Promise<ScanPoisResult[]> {
    const categories = Object.entries(POI_CATEGORY_META) as Array<
        [PoiCategory, { label: string; keywords: string[] }]
    >;

    const results: ScanPoisResult[] = [];
    for (const [category, meta] of categories) {
        // eslint-disable-next-line no-await-in-loop
        const resultsPerKeyword = await Promise.all(
            meta.keywords.map(keyword =>
                searchPlacesByCategory(keyword, center).catch(() => []),
            ),
        );
        const candidates = resultsPerKeyword
            .flat()
            .filter(place => isPointInWardBoundary(place.lng, place.lat));

        // eslint-disable-next-line no-await-in-loop
        const existing = await Poi.find({ category }).select("lat lng");
        const isNearExisting = (lat: number, lng: number) =>
            existing.some(
                p => Math.abs(p.lat - lat) < 0.0003 && Math.abs(p.lng - lng) < 0.0003,
            );

        let created = 0;
        let skippedExisting = 0;
        const seenInThisRun = new Set<string>();
        for (const place of candidates) {
            const dedupeKey = `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`;
            if (seenInThisRun.has(dedupeKey) || isNearExisting(place.lat, place.lng)) {
                skippedExisting += 1;
                continue;
            }
            seenInThisRun.add(dedupeKey);
            // eslint-disable-next-line no-await-in-loop
            await Poi.create({
                name: place.name,
                category,
                lat: place.lat,
                lng: place.lng,
                address: place.address,
                verified: false,
                source: "scan",
                createdBy: actorId,
                updatedBy: actorId,
            });
            created += 1;
        }
        results.push({ category, label: meta.label, created, skippedExisting });
    }
    return results;
}
