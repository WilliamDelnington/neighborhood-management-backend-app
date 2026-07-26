/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * SecurityRecord.handlingStatus (chua_xu_ly/dang_xu_ly/da_xu_ly) da doi thanh
 * SecurityRecord.monitoringStatus (binh_thuong/dang_theo_doi/da_bao_cong_an/
 * da_ket_thuc) - xem models/SecurityRecord.ts va validators/security.ts. Doi
 * schema khong tu dong sua du lieu da luu, nen ho so cu van con truong
 * handlingStatus (cu, khong con duoc doc) va thieu monitoringStatus/
 * inspectionDate (moi). Script nay:
 *   1. Suy ra monitoringStatus tu handlingStatus cu (anh xa 1-1, xem MAP_OLD_TO_NEW).
 *   2. Dat inspectionDate = createdAt cho ho so chua co (createdAt la xap xi
 *      hop ly nhat cho "ngay kiem tra" doi voi ho so tao truoc khi co truong nay).
 *   3. Xoa han truong handlingStatus cu (da duoc thay the, khong con y nghia).
 * An toan de chay nhieu lan (idempotent) - chi xu ly ho so chua co monitoringStatus.
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua models/index.ts -> Citizen model) phai duoc import DONG
 * (dynamic import) sau khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts
 * de biet ly do (TypeScript/CJS hoist import tinh len dau file bat ke vi tri
 * trong source, khien bien moi truong chua kip nap khi module duoc require()).
 */

const MAP_OLD_TO_NEW: Record<string, string> = {
    chua_xu_ly: "binh_thuong",
    dang_xu_ly: "dang_theo_doi",
    da_xu_ly: "da_ket_thuc",
};

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { SecurityRecord } = await import("../src/models");

    await connectDB();

    const legacyDocs = await SecurityRecord.collection
        .find({ monitoringStatus: { $exists: false } })
        .toArray();
    console.log(
        `Tim thay ${legacyDocs.length} ho so an ninh chua co monitoringStatus.`,
    );

    for (const doc of legacyDocs) {
        const oldStatus = String(doc.handlingStatus || "");
        const newStatus = MAP_OLD_TO_NEW[oldStatus] || "binh_thuong";
        const inspectionDate = doc.inspectionDate || doc.createdAt || new Date();

        // eslint-disable-next-line no-await-in-loop
        await SecurityRecord.collection.updateOne(
            { _id: doc._id },
            {
                $set: { monitoringStatus: newStatus, inspectionDate },
                $unset: { handlingStatus: "", temporaryResidenceDeclared: "" },
            },
        );
        console.log(
            `Ho so ${doc._id}: handlingStatus "${oldStatus}" -> monitoringStatus "${newStatus}", inspectionDate = ${new Date(
                inspectionDate,
            ).toISOString()}.`,
        );
    }

    console.log(`\nHoan tat. Da cap nhat ${legacyDocs.length} ho so.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
