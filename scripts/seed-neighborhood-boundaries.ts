/* eslint-disable no-console */
/**
 * Nap ranh gioi (geometry) cho cac To dan pho (TDP) phuong Duong Noi tu du
 * lieu ve tay trong scripts/data/duongNoiTdpBoundaries.ts (sao chep tu du an
 * thu nghiem "test-map" ve ranh gioi 21/21 to) vao Neighborhood.geometry +
 * boundaryType="GEOJSON" - de module "Ban do to dan pho" tren Dashboard
 * (NeighborhoodZonesMap.tsx) co du lieu hien thi.
 *
 * Khop To dan pho trong DB voi tung phan tu trong du lieu ve tay bang TEN da
 * chuan hoa (bo dau, hoa het, trim) - vi du lieu ve tay khong co `code`/`sequence`
 * on dinh, chi co ten that cua tung to (vd "QUYẾT TIẾN", "TỔ 1"...).
 *
 * AN TOAN de chay lai nhieu lan (idempotent):
 *   - Mac dinh CHI set geometry cho to CHUA co boundaryType="GEOJSON" - khong
 *     ghi de ranh gioi da duoc admin tu ve/sua qua UI. Chay voi FORCE=1 de ghi
 *     de toan bo (vd sau khi sua lai du lieu ve tay).
 *   - Khong dong den to khong khop duoc ten - se duoc liet ke ra cuoi log de
 *     admin tu doi chieu/sua ten cho khop hoac gan tay qua API.
 *
 * Chay: npm run seed:neighborhood-boundaries   (them FORCE=1 de ghi de)
 *
 * LUU Y IMPORT: xem giai thich chi tiet trong scripts/create-proposal-accounts.ts
 * va scripts/seed-neighborhoods.ts - phai nap .env TRUOC, import model/lib qua
 * dynamic import() SAU khi env da san sang.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

type ModelsModule = typeof import("../src/models");

const FORCE = process.env.FORCE === "1";

function normalizeName(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/gi, "d")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }

    const { connectDB } = await import("../src/lib/mongodb");
    await connectDB();

    const { Neighborhood } = (await import("../src/models")) as ModelsModule;
    const { RAW_ZONES } = await import("./data/duongNoiTdpBoundaries");

    const zoneByNormalizedName = new Map<
        string,
        { name: string; geometry: { type: string; coordinates: unknown[] } }
    >();
    for (const zone of RAW_ZONES as Array<{
        name: string;
        geometry: { type: string; coordinates: unknown[] };
    }>) {
        zoneByNormalizedName.set(normalizeName(zone.name), {
            name: zone.name,
            geometry: zone.geometry,
        });
    }

    const neighborhoods = await Neighborhood.find({});
    const matchedZoneKeys = new Set<string>();

    let updated = 0;
    let skippedAlreadySet = 0;
    const unmatchedNeighborhoods: string[] = [];

    for (const neighborhood of neighborhoods) {
        const key = normalizeName(neighborhood.name);
        const zone = zoneByNormalizedName.get(key);
        if (!zone) {
            unmatchedNeighborhoods.push(
                `${neighborhood.name} (${neighborhood.code}, wardCode=${neighborhood.wardCode ?? "?"})`,
            );
            continue;
        }
        matchedZoneKeys.add(key);

        if (neighborhood.boundaryType === "GEOJSON" && neighborhood.geometry && !FORCE) {
            skippedAlreadySet += 1;
            continue;
        }

        neighborhood.boundaryType = "GEOJSON";
        neighborhood.geometry = zone.geometry as unknown as {
            type: "Polygon" | "MultiPolygon";
            coordinates: unknown[];
        };
        // eslint-disable-next-line no-await-in-loop
        await neighborhood.save();
        updated += 1;
        console.log(`  Da cap nhat ranh gioi: ${neighborhood.name} (${neighborhood.code})`);
    }

    const unmatchedZones = [...zoneByNormalizedName.entries()]
        .filter(([key]) => !matchedZoneKeys.has(key))
        .map(([, zone]) => zone.name);

    console.log("\n==============================================");
    console.log(`To dan pho da cap nhat ranh gioi:      ${updated}`);
    console.log(`To dan pho da co san (bo qua):         ${skippedAlreadySet}${FORCE ? " (FORCE=1 nen da ghi de het)" : ""}`);
    console.log(`Tong so to dan pho trong DB:            ${neighborhoods.length}`);
    console.log(`Tong so to trong du lieu ve tay:         ${RAW_ZONES.length}`);
    if (unmatchedNeighborhoods.length > 0) {
        console.log(`\nTo dan pho trong DB KHONG khop duoc ten voi du lieu ve tay (${unmatchedNeighborhoods.length}):`);
        unmatchedNeighborhoods.forEach(line => console.log(`  - ${line}`));
    }
    if (unmatchedZones.length > 0) {
        console.log(`\nTo trong du lieu ve tay KHONG khop duoc voi to dan pho nao trong DB (${unmatchedZones.length}):`);
        unmatchedZones.forEach(name => console.log(`  - ${name}`));
        console.log(
            "  -> Doi chieu lai ten To dan pho trong DB (sua qua man Sua to dan pho) roi chay lai script,",
        );
        console.log("     hoac tu gan geometry qua API PATCH /api/neighborhoods/:id.");
    }
    console.log("==============================================");

    const { default: mongoose } = await import("mongoose");
    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Nap ranh gioi to dan pho that bai:", err);
    process.exit(1);
});
