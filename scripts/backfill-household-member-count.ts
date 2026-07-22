/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Tinh lai memberCount cho MOI Household dua tren so Citizen thuc te (khac
 * voi gia tri nhap tay truoc day qua API/import Excel, nay khong con duoc
 * chap nhan - xem validators/household.ts va importService.ts). An toan de
 * chay nhieu lan (idempotent) - chi ghi lai khi gia tri thay doi. Chay mot
 * lan sau khi trien khai thay doi nay de sua du lieu sai lech hien co; tu do
 * ve sau memberCount duoc citizenService.ts tu dong +1/-1 khi Citizen duoc
 * them/xoa/chuyen ho dan (xem adjustHouseholdMemberCount).
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua Citizen model) phai duoc import DONG (dynamic import) sau
 * khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do
 * (TypeScript/CJS hoist import tinh len dau file bat ke vi tri trong source).
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Household, Citizen } = await import("../src/models");

    await connectDB();

    const households = await Household.find().select("_id memberCount");
    console.log(`Tim thay ${households.length} ho dan can kiem tra memberCount.`);

    let updated = 0;
    for (const household of households) {
        // eslint-disable-next-line no-await-in-loop
        const actualCount = await Citizen.countDocuments({
            householdId: household._id,
        });
        if (actualCount !== household.memberCount) {
            // eslint-disable-next-line no-await-in-loop
            await Household.updateOne(
                { _id: household._id },
                { $set: { memberCount: actualCount } },
            );
            updated += 1;
        }
    }

    console.log(
        `\nHoan tat. Da sua memberCount cho ${updated}/${households.length} ho dan.`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
