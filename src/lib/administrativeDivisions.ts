import { HttpError } from "@/lib/response";

// Proxy + cache cho du lieu don vi hanh chinh cong khai tu
// https://provinces.open-api.vn/api/v2/ (cau truc 2 cap sau sap nhap 2025:
// tinh/thanh pho -> phuong/xa truc tiep, khong con cap huyen). Khong luu
// collection Mongoose rieng - nguon "su that" van la API ben ngoai, House chi
// luu lai code+name da chon (xem models/HouseRecord.ts). Cache TTL 24h la du
// vi day la du lieu hanh chinh gan nhu tinh (chi doi khi co sap nhap/tach
// tinh/phuong that su), tranh goi lai API ben ngoai tren moi request cua form
// tao nha so.
const BASE_URL = "https://provinces.open-api.vn/api/v2";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface Province {
    name: string;
    code: number;
    division_type: string;
    codename: string;
    phone_code?: number;
}

export interface Ward {
    name: string;
    code: number;
    division_type: string;
    codename: string;
    province_code: number;
}

let provincesCache: { data: Province[]; expiresAt: number } | null = null;
const wardsCache = new Map<number, { data: Ward[]; expiresAt: number }>();

export async function fetchProvinces(): Promise<Province[]> {
    if (provincesCache && Date.now() < provincesCache.expiresAt) {
        return provincesCache.data;
    }
    const res = await fetch(`${BASE_URL}/p/`);
    if (!res.ok) {
        throw new HttpError("Khong the tai danh sach tinh/thanh pho", 502);
    }
    const data = (await res.json()) as Province[];
    provincesCache = { data, expiresAt: Date.now() + TTL_MS };
    return data;
}

export async function fetchWardsByProvince(provinceCode: number): Promise<Ward[]> {
    const cached = wardsCache.get(provinceCode);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }
    const res = await fetch(`${BASE_URL}/p/${provinceCode}?depth=2`);
    if (!res.ok) {
        throw new HttpError("Khong the tai danh sach phuong/xa", 502);
    }
    const province = (await res.json()) as Province & { wards?: Ward[] };
    const data = province.wards || [];
    wardsCache.set(provinceCode, { data, expiresAt: Date.now() + TTL_MS });
    return data;
}
