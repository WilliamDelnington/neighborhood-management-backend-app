/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Tao Street (chuan hoa) tuong ung voi tung gia tri `cluster` (chuoi tu do,
 * legacy) dang ton tai tren HouseRecord/Household/Business, roi gan streetId
 * cho tung ban ghi con thieu. Khong dong/xoa `cluster` - chi bo sung streetId
 * (xem src/lib/streetSync.ts) de giu tuong thich nguoc voi cac client chua
 * chuyen sang Street picker.
 *
 * An toan de chay nhieu lan (idempotent) - chi cham vao ban ghi chua co
 * streetId; cac Street da ton tai (trung ten) duoc tai su dung, khong tao
 * trung lap.
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua models/index.ts -> Citizen model) phai duoc import DONG
 * (dynamic import) sau khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { HouseRecord, Household, Business } = await import("../src/models");
    const { resolveStreetForCluster } = await import("../src/lib/streetSync");

    await connectDB();

    const collections = [
        { name: "HouseRecord", model: HouseRecord },
        { name: "Household", model: Household },
        { name: "Business", model: Business },
    ];

    const distinctClusters = new Set<string>();
    for (const { model } of collections) {
        const values: string[] = await model.distinct("cluster", {
            streetId: { $exists: false },
        });
        for (const value of values) {
            if (value && value.trim()) distinctClusters.add(value.trim());
        }
    }

    console.log(`Tim thay ${distinctClusters.size} gia tri cluster can chuan hoa thanh Street`);

    const streetIdByCluster = new Map<string, string>();
    for (const cluster of distinctClusters) {
        const { streetId } = await resolveStreetForCluster(cluster);
        streetIdByCluster.set(cluster, streetId);
        console.log(`  - "${cluster}" -> Street ${streetId}`);
    }

    for (const { name, model } of collections) {
        let updatedCount = 0;
        for (const [cluster, streetId] of streetIdByCluster) {
            const result = await model.updateMany(
                { cluster, streetId: { $exists: false } },
                { $set: { streetId } },
            );
            updatedCount += result.modifiedCount;
        }
        console.log(`Đã cập nhật streetId cho ${updatedCount} bản ghi ${name}`);
    }

    console.log("\nHoàn tất backfill Street.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
