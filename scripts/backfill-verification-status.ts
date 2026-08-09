/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Migrate du lieu Household/Business sang mo hinh xac thuc moi: ca hai gio
 * dung chung mot truong `status` (VerificationStatus - "unverified"/"pending"/
 * "verified"/"denied"/"locked", giong het HouseRecord) thay cho cap truong cu:
 * - Household: `recordStatus` ("draft"/"active").
 * - Business: `status` cu (BusinessStatus - "unverified"/"pending_approval"/
 *   "need_supplement"/"verified") + `recordStatus` ("draft"/"active").
 *
 * Quy tac chuyen doi (xem ke hoach da duyet - khong lam nguoc lai, khong tao
 * backlog duyet thu cong khong can thiet cho du lieu da "active" tu truoc):
 * - Household: recordStatus="active" -> status="verified" (coi du lieu cu la
 *   da duoc tin tuong, tranh don het vao hang cho duyet moi). recordStatus=
 *   "draft" -> "pending" neu nha so cha dang "verified" (tuong duong cascade
 *   se ap dung ngay sau do), nguoc lai "unverified".
 * - Business: status cu "verified" -> "verified" (tin hieu manh nhat, giu
 *   nguyen bat ke recordStatus). status cu "need_supplement" -> "denied".
 *   Con lai (status cu "unverified"/"pending_approval") -> "pending" neu
 *   recordStatus="active", nguoc lai "unverified".
 *
 * Dung raw collection (khong qua Mongoose model) vi cac truong `recordStatus`/
 * status-cu-cua-Business khong con khai bao trong schema hien tai - Mongoose
 * document se khong doc lai duoc cac truong da bi go khoi schema.
 *
 * An toan de chay nhieu lan (idempotent) - bo qua ban ghi da co status thuoc
 * VERIFICATION_STATUS moi (unverified/pending/verified/denied/locked) VA
 * khong con recordStatus (da duoc migrate roi).
 *
 * KHONG tu dong chay - phai duoc goi thu cong (npx tsx scripts/backfill-verification-status.ts)
 * sau khi xac nhan voi nguoi quan tri du lieu, giong cac script backfill khac
 * trong thu muc nay.
 */

const NEW_STATUS_VALUES = new Set([
    "unverified",
    "pending",
    "verified",
    "denied",
    "locked",
]);

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { HouseRecord } = await import("../src/models");

    await connectDB();

    const householdCollection = HouseRecord.db.collection("households");
    const businessCollection = HouseRecord.db.collection("businesses");
    const houseCollection = HouseRecord.db.collection("houses");

    const verifiedHouseIds = new Set(
        (
            await houseCollection
                .find({ status: "verified" }, { projection: { _id: 1 } })
                .toArray()
        ).map(h => String(h._id)),
    );

    let householdUpdated = 0;
    const households = await householdCollection
        .find({}, { projection: { _id: 1, status: 1, recordStatus: 1, houseId: 1 } })
        .toArray();
    for (const h of households) {
        if (h.status && NEW_STATUS_VALUES.has(h.status) && h.recordStatus === undefined) {
            continue; // da migrate roi
        }
        const isHouseVerified = h.houseId && verifiedHouseIds.has(String(h.houseId));
        const newStatus =
            h.recordStatus === "active"
                ? "verified"
                : isHouseVerified
                  ? "pending"
                  : "unverified";
        await householdCollection.updateOne(
            { _id: h._id },
            { $set: { status: newStatus }, $unset: { recordStatus: "" } },
        );
        householdUpdated++;
    }

    let businessUpdated = 0;
    const businesses = await businessCollection
        .find({}, { projection: { _id: 1, status: 1, recordStatus: 1 } })
        .toArray();
    for (const b of businesses) {
        if (b.status && NEW_STATUS_VALUES.has(b.status) && b.recordStatus === undefined) {
            continue; // da migrate roi
        }
        let newStatus: string;
        if (b.status === "verified") {
            newStatus = "verified";
        } else if (b.status === "need_supplement") {
            newStatus = "denied";
        } else {
            newStatus = b.recordStatus === "active" ? "pending" : "unverified";
        }
        await businessCollection.updateOne(
            { _id: b._id },
            { $set: { status: newStatus }, $unset: { recordStatus: "" } },
        );
        businessUpdated++;
    }

    console.log(
        `Da migrate status cho ${householdUpdated} ho dan va ${businessUpdated} ho kinh doanh.`,
    );

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
