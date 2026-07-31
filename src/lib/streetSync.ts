import { Street } from "@/models";
import { HttpError } from "@/lib/response";

/**
 * Giu dong bo cap gia tri cluster (chuoi tu do, legacy) <-> streetId (Street
 * chuan hoa, moi) tren Household/HouseRecord/Business. Cac client cu chi gui
 * `cluster` (chua doi UI) van hoat dong binh thuong - server tu resolve/tao
 * Street tuong ung; client moi (Street picker) gui `streetId` truc tiep, server
 * suy ra `cluster` tu ten Street de cac man hinh/permission cu dua tren chuoi
 * `cluster` khong bi vo hieu.
 */
export async function resolveStreetForCluster(
    cluster: string,
): Promise<{ streetId: string; cluster: string }> {
    const name = cluster.trim();
    let street = await Street.findOne({ name });
    if (!street) {
        const code = await generateStreetCode(name);
        street = await Street.create({ name, code, active: true });
    }
    return { streetId: String(street._id), cluster: street.name };
}

export async function resolveClusterForStreet(
    streetId: string,
): Promise<{ streetId: string; cluster: string }> {
    const street = await Street.findById(streetId);
    if (!street) {
        throw new HttpError("Khong tim thay duong/pho", 404);
    }
    return { streetId: String(street._id), cluster: street.name };
}

/**
 * Diem vao dung chung cho service layer: uu tien streetId (client moi) neu
 * co, nguoc lai resolve/tao Street tu cluster (client cu). Nem loi neu ca hai
 * deu thieu - goi noi da dam bao it nhat mot truong ton tai (vd validator
 * refine cua HouseRecord) truoc khi goi ham nay.
 */
export async function resolveStreetClusterPair(input: {
    cluster?: string | null;
    streetId?: string | null;
}): Promise<{ streetId: string; cluster: string }> {
    if (input.streetId) return resolveClusterForStreet(input.streetId);
    if (input.cluster) return resolveStreetForCluster(input.cluster);
    throw new HttpError("Can cluster hoac streetId de xac dinh duong/pho", 422);
}

/**
 * Sinh ma duong/pho tu ten khi backfill/tu dong tao (khong co ma nguoi dung
 * nhap tay) - bo dau, thay khoang trang bang "_", them hau to so neu trung.
 */
async function generateStreetCode(name: string): Promise<string> {
    const base =
        name
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/đ/gi, "d")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || "STREET";

    let code = base;
    let suffix = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await Street.exists({ code })) {
        suffix += 1;
        code = `${base}_${suffix}`;
    }
    return code;
}
