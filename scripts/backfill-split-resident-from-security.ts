/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * SecurityRecord truoc day gom ca thong tin cu tru (ownershipType,
 * renterCount) lan an ninh (level, monitoringStatus, ...) - nay tach thanh
 * hai ho so doc lap: ResidentRecord (cu tru) va SecurityRecord (an ninh, da
 * bo ownershipType/renterCount khoi schema - xem models/SecurityRecord.ts).
 * Script nay:
 *   1. Voi moi SecurityRecord con truong ownershipType (chua tach), tao mot
 *      ResidentRecord tuong ung voi cac truong cu tru + cung createdAt.
 *   2. $unset ownershipType/renterCount tren chinh SecurityRecord do (GIU
 *      NGUYEN _id) - de moi Request.relatedId dang tro toi SecurityRecord
 *      nay van hop le, khong can remap.
 * An toan de chay nhieu lan (idempotent) - dieu kien loc la con truong
 * ownershipType, chi xu ly ho so chua tach.
 *
 * Cac module cua app phai duoc import DONG (dynamic import) sau khi loadEnv()
 * chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do.
 */

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { SecurityRecord, ResidentRecord } = await import("../src/models");

    await connectDB();

    const legacyDocs = await SecurityRecord.collection
        .find({ ownershipType: { $exists: true } })
        .toArray();
    console.log(
        `Tim thay ${legacyDocs.length} ban ghi an ninh chua tach ho so cu tru.`,
    );

    for (const doc of legacyDocs) {
        // eslint-disable-next-line no-await-in-loop
        await ResidentRecord.create({
            houseId: doc.houseId,
            ownershipType: doc.ownershipType || "chinh_chu",
            renterCount: doc.renterCount || 0,
            inspectionDate: doc.inspectionDate || doc.createdAt || new Date(),
            createdBy: doc.createdBy,
            updatedBy: doc.updatedBy,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        });

        // eslint-disable-next-line no-await-in-loop
        await SecurityRecord.collection.updateOne(
            { _id: doc._id },
            { $unset: { ownershipType: "", renterCount: "" } },
        );
        console.log(
            `SecurityRecord ${doc._id}: da tach ResidentRecord cho nha ${doc.houseId}.`,
        );
    }

    console.log(`\nHoan tat. Da tach ${legacyDocs.length} ho so cu tru.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
