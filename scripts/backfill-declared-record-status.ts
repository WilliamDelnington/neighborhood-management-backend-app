/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Household/Business gio co truong `recordStatus` ("draft"/"active" - xem
 * DeclaredRecordStatus trong types/index.ts). Doi schema khong tu dong sua du
 * lieu da luu, nen ho dan/ho kinh doanh tao truoc khi co truong nay van thieu
 * recordStatus. Script nay dat recordStatus = "active" cho cac ban ghi chua co
 * truong nay - hop ly vi truoc day Household chi tao duoc duoi nha da
 * "verified" (xem assertHouseRecordVerifiedForMembers cu), va Business du
 * chua bi chan theo trang thai nha van la du lieu dang hoat dong thuc te.
 * An toan de chay nhieu lan (idempotent) - chi xu ly ban ghi chua co recordStatus.
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
    const { Household, Business } = await import("../src/models");

    await connectDB();

    const [householdResult, businessResult] = await Promise.all([
        Household.updateMany(
            { recordStatus: { $exists: false } },
            { $set: { recordStatus: "active" } },
        ),
        Business.updateMany(
            { recordStatus: { $exists: false } },
            { $set: { recordStatus: "active" } },
        ),
    ]);
    console.log(
        `Da cap nhat recordStatus="active" cho ${householdResult.modifiedCount} ho dan va ${businessResult.modifiedCount} ho kinh doanh chua co truong nay.`,
    );

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
