import { POI_CATEGORIES, type PoiCategory } from "@/models/Poi";

// Nhan + tu khoa quet cho tung danh muc "Điểm tiện ích" - dung boi
// poiService.scanPois() (goi Goong Autocomplete, xem lib/integrations/goong.ts).
// Nhan PHAI khop voi POI_CATEGORIES trong NeighborhoodZonesMap.tsx (frontend)
// vi ca 2 noi cung hien thi cung 1 danh sach danh muc cho admin.
export const POI_CATEGORY_META: Record<
    PoiCategory,
    { label: string; keywords: string[] }
> = {
    ubnd: { label: "UBND", keywords: ["Ủy ban nhân dân Phường Dương Nội"] },
    police: { label: "Công an", keywords: ["Công an Phường Dương Nội"] },
    atm: {
        label: "Ngân hàng ATM",
        keywords: ["ATM Agribank", "ATM Vietcombank", "ATM BIDV", "ATM Vietinbank", "ATM MB Bank"],
    },
    clinic: {
        label: "Trạm y tế",
        keywords: ["Trạm y tế Phường Dương Nội", "Phòng khám Dương Nội"],
    },
    school: {
        label: "Trường học",
        keywords: [
            "trường mầm non",
            "trường tiểu học",
            "trường trung học cơ sở",
            "trường trung học phổ thông",
        ],
    },
    post: { label: "Bưu điện", keywords: ["Bưu điện Dương Nội"] },
    gas: { label: "Cây xăng", keywords: ["cây xăng", "trạm xăng dầu"] },
    market: { label: "Chợ / Siêu thị", keywords: ["chợ", "siêu thị"] },
    restaurant: { label: "Quán ăn ngon", keywords: ["quán ăn", "nhà hàng"] },
    cafe: { label: "Quán cafe", keywords: ["quán cà phê", "quán trà sữa"] },
    bus: { label: "Trạm xe buýt", keywords: ["trạm xe buýt", "điểm dừng xe buýt"] },
    apartment: { label: "Căn hộ / Chung cư", keywords: ["chung cư", "khu đô thị"] },
    // keywords rong: khong the "quet" tu Goong Autocomplete, chi tao thu cong
    // qua cong cu "Gắn hộ dân lên bản đồ" (xem poiService.createPoi).
    household: { label: "Hộ dân", keywords: [] },
};

// Sanity check luc build/khoi dong - dam bao khong quen khai bao danh muc nao
// khi them moi vao POI_CATEGORIES.
POI_CATEGORIES.forEach(category => {
    if (!POI_CATEGORY_META[category]) {
        throw new Error(`Thieu POI_CATEGORY_META cho danh muc "${category}"`);
    }
});
