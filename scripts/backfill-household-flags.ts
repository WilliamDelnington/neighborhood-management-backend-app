/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Tinh lai hasDisabledChild/hasDisabledPerson cho MOI Household dua tren
 * Citizen thuc te (isDisabledChild/isDisabledOrSupportNeeded) - can chay mot
 * lan sau khi trien khai tinh nang "trang thai dac biet cua ho dan", vi cac
 * Household da ton tai truoc do se mac dinh ca hai co nay la false ke ca khi
 * da co Citizen phu hop. An toan de chay nhieu lan (idempotent) - chi ghi lai
 * khi gia tri thay doi. Tu do ve sau hai co nay duoc citizenService.ts tu dong
 * dong bo lai khi Citizen duoc them/sua/xoa/chuyen ho dan (xem
 * recomputeHouseholdFlags).
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua Citizen model) phai duoc import DONG (dynamic import) sau
 * khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Household, Citizen } = await import("../src/models");

    await connectDB();

    const households = await Household.find().select(
        "_id hasDisabledChild hasDisabledPerson",
    );
    console.log(
        `Tim thay ${households.length} ho dan can kiem tra hasDisabledChild/hasDisabledPerson.`,
    );

    let updated = 0;
    for (const household of households) {
        // eslint-disable-next-line no-await-in-loop
        const [hasDisabledChild, hasDisabledPerson] = await Promise.all([
            Citizen.exists({
                householdId: household._id,
                isDisabledChild: true,
            }),
            Citizen.exists({
                householdId: household._id,
                isDisabledOrSupportNeeded: true,
            }),
        ]);
        const nextHasDisabledChild = !!hasDisabledChild;
        const nextHasDisabledPerson = !!hasDisabledPerson;
        if (
            nextHasDisabledChild !== household.hasDisabledChild ||
            nextHasDisabledPerson !== household.hasDisabledPerson
        ) {
            // eslint-disable-next-line no-await-in-loop
            await Household.updateOne(
                { _id: household._id },
                {
                    $set: {
                        hasDisabledChild: nextHasDisabledChild,
                        hasDisabledPerson: nextHasDisabledPerson,
                    },
                },
            );
            updated += 1;
        }
    }

    console.log(
        `\nHoan tat. Da sua co cho ${updated}/${households.length} ho dan.`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
