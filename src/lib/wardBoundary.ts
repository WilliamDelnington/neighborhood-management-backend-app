import wardBoundary from "@/data/duongNoiWardBoundary.json";

// Ray-casting chuan - kiem tra 1 diem co nam trong 1 ring (vong) hay khong.
// Sao chep tu NeighborhoodZonesMap.tsx (frontend) - dung cho poiService.scanPois()
// de loai bo ket qua Goong Autocomplete nam ngoai dung hinh dang that cua
// Phuong (khac bbox hinh chu nhat, RONG HON nhieu so voi hinh dang thuc te vi
// Phuong Duong Noi la mot khoi cheo/khong deu).
function isPointInRing(lng: number, lat: number, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const intersect =
            yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

export function isPointInWardBoundary(lng: number, lat: number): boolean {
    const feature = (
        wardBoundary as { features: Array<{ geometry: { type: string; coordinates: unknown } }> }
    ).features[0];
    const { geometry } = feature;
    const polygons =
        geometry.type === "MultiPolygon"
            ? (geometry.coordinates as number[][][][])
            : [geometry.coordinates as number[][][]];

    return polygons.some(rings => {
        if (rings.length === 0 || !isPointInRing(lng, lat, rings[0])) return false;
        for (let i = 1; i < rings.length; i += 1) {
            if (isPointInRing(lng, lat, rings[i])) return false;
        }
        return true;
    });
}
