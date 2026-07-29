/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Business gio co truong `status` (unverified/pending/verified/denied/locked
 * - cung 5 trang thai xac thuc nhu HouseRecord, xem transitionBusinessStatus
 * trong businessService.ts). Doi schema khong tu dong sua du lieu da luu, nen
 * ho kinh doanh tao truoc khi co truong nay van thieu status. Script nay dat
 * status = "unverified" cho cac ho kinh doanh chua co truong nay.
 * An toan de chay nhieu lan (idempotent) - chi xu ly ho so chua co status.
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua models/index.ts -> Citizen model) phai duoc import DONG
 * (dynamic import) sau khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts
 * de biet ly do.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Business } = await import("../src/models");

    await connectDB();

    const result = await Business.updateMany(
        { status: { $exists: false } },
        { $set: { status: "unverified" } },
    );
    console.log(
        `Da cap nhat status="unverified" cho ${result.modifiedCount} ho kinh doanh chua co truong nay.`,
    );

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
