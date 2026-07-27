/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Truoc day SecurityRecord tham chieu Household qua truong householdId; nay da
 * doi sang tham chieu House qua truong houseId (xem services/securityService.ts
 * va models/SecurityRecord.ts), giong cach PcccCheck da chuyen truoc do (xem
 * scripts/backfill-pccc-house-id.ts). Doi ten schema khong tu dong sua du lieu
 * da luu - cac ban ghi cu van con truong householdId (khong con trong schema
 * hien tai nen phai doc qua raw collection) va thieu houseId, khien
 * populate("houseId") tra ve null va lam sap trang danh sach an ninh o admin.
 * An toan de chay nhieu lan (idempotent) - chi xu ly cac ban ghi chua co houseId.
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua models/index.ts -> Citizen model) phai duoc import DONG
 * (dynamic import) sau khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts
 * de biet ly do (TypeScript/CJS hoist import tinh len dau file bat ke vi tri
 * trong source, khien bien moi truong chua kip nap khi module duoc require()).
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Household, SecurityRecord } = await import("../src/models");

    await connectDB();

    const legacyDocs = await SecurityRecord.collection
        .find({ houseId: { $exists: false } })
        .toArray();
    console.log(
        `Tim thay ${legacyDocs.length} ho so an ninh con dung householdId cu.`,
    );

    let updated = 0;
    let unresolved = 0;

    for (const doc of legacyDocs) {
        const householdId = doc.householdId;
        const household = householdId
            ? // eslint-disable-next-line no-await-in-loop
              await Household.findById(householdId).select("_id houseId")
            : null;

        if (household?.houseId) {
            // eslint-disable-next-line no-await-in-loop
            await SecurityRecord.collection.updateOne(
                { _id: doc._id },
                {
                    $set: { houseId: household.houseId },
                    $unset: { householdId: "" },
                },
            );
            updated += 1;
        } else {
            unresolved += 1;
            console.log(
                `Khong xac dinh duoc nha cho ho so an ninh ${doc._id} (householdId cu: ${householdId}) - ho dan nay chua duoc gan nha so, can xu ly thu cong.`,
            );
        }
    }

    console.log(
        `\nHoan tat. Da cap nhat ${updated}/${legacyDocs.length} ho so, ${unresolved} ho so khong the tu dong xac dinh nha (can kiem tra thu cong).`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
