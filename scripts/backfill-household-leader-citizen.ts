/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Sua du lieu cu: truoc khi createHousehold tu dong tao Citizen "Chủ hộ" (xem
 * householdService.ts), khai bao ho dan chi luu headOfHousehold la text tren
 * Household, khong sinh ra Citizen nao - nen chu ho khong xuat hien trong
 * danh sach nhan khau (GET /households/:id/citizens chi doc tu Citizen). Script
 * nay quet cac Household nhu vay va tao bu lai Citizen con thieu.
 *
 * Bo qua ho dan da co san mot Citizen trung ten (khong phan biet hoa/thuong)
 * voi headOfHousehold - du Citizen do co the da duoc nhan vien tu tay them
 * truoc day voi mot relationToHead khac "Chủ hộ" - de tranh tao trung nguoi.
 * An toan de chay nhieu lan (idempotent): ho dan da co Citizen "Chủ hộ" hoac
 * trung ten se duoc bo qua o lan chay sau.
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
        "_id headOfHousehold createdBy",
    );
    console.log(`Tim thay ${households.length} ho dan can kiem tra.`);

    let created = 0;
    let skipped = 0;

    for (const household of households) {
        const normalizedHead = household.headOfHousehold.trim().toLowerCase();

        // eslint-disable-next-line no-await-in-loop
        const existingCitizens = await Citizen.find({
            householdId: household._id,
        }).select("fullName");
        const alreadyPresent = existingCitizens.some(
            c => c.fullName.trim().toLowerCase() === normalizedHead,
        );

        if (alreadyPresent) {
            skipped += 1;
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await Citizen.create({
            fullName: household.headOfHousehold,
            relationToHead: "Chủ hộ",
            householdId: household._id,
            createdBy: household.createdBy,
            updatedBy: household.createdBy,
        });
        // eslint-disable-next-line no-await-in-loop
        await Household.updateOne(
            { _id: household._id },
            { $inc: { memberCount: 1 } },
        );
        created += 1;
    }

    console.log(
        `\nHoan tat. Da tao Citizen "Chủ hộ" cho ${created}/${households.length} ho dan (bo qua ${skipped} ho dan da co nhan khau trung ten chu ho).`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
