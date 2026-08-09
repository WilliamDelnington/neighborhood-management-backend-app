/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * House<->chu nha gio la quan he nhieu-nhieu qua model HouseOwnership (xem
 * houseOwnershipService.ts) thay vi mot cap ownerId/ownerType duy nhat tren
 * HouseRecord. HouseRecord.ownerId/ownerType van con nhung nay chi la CACHE
 * cua quan he primary_owner dang active - cac nha so da ton tai truoc khi co
 * HouseOwnership chua co ban ghi primary_owner tuong ung nao ca, script nay
 * tao bu lai tu chinh cache do de dam bao khong mat du lieu chu so huu hien co.
 * An toan de chay nhieu lan (idempotent) - bo qua nha so da co san ban ghi
 * primary_owner dang active.
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua models/index.ts -> Citizen model) phai duoc import DONG
 * (dynamic import) sau khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { HouseRecord, HouseOwnership } = await import("../src/models");

    await connectDB();

    const housesWithOwner = await HouseRecord.find({
        ownerId: { $exists: true, $ne: null },
    }).select("_id ownerId ownerType status createdAt");
    console.log(
        `Tim thay ${housesWithOwner.length} nha so co ownerId (cache primary_owner).`,
    );

    let created = 0;
    let skipped = 0;

    for (const house of housesWithOwner) {
        // eslint-disable-next-line no-await-in-loop
        const existingPrimary = await HouseOwnership.findOne({
            houseId: house._id,
            active: true,
            relationshipType: "primary_owner",
        });
        if (existingPrimary) {
            skipped += 1;
            continue;
        }

        const verificationStatus =
            house.status === "verified"
                ? "verified"
                : house.status === "denied"
                  ? "rejected"
                  : "waiting_verification";

        // eslint-disable-next-line no-await-in-loop
        await HouseOwnership.create({
            houseId: house._id,
            ownerType: house.ownerType || "user",
            ownerId: house.ownerId,
            relationshipType: "primary_owner",
            startDate: house.createdAt,
            active: true,
            verificationStatus,
        });
        created += 1;
    }

    console.log(
        `\nHoan tat. Da tao ${created} ban ghi HouseOwnership (primary_owner), bo qua ${skipped} nha da co san.`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
