/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Ma hoa phone/cccd cua cac Citizen da ton tai truoc khi co ma hoa AES-256-GCM
 * (xem models/Citizen.ts). An toan de chay nhieu lan - ban ghi da ma hoa se
 * duoc bo qua. Phai chay mot lan sau khi trien khai thay doi nay de du lieu cu
 * co the tim kiem lai duoc qua phoneHash/cccdHash.
 *
 * Luu y: post("init") tren CitizenSchema chi giai ma vao bo nho, khong danh
 * dau field la "modified" - nen phai goi markModified() de pre("save") ma hoa
 * lai va dien hash khi save().
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import) phai duoc import ĐỘNG (dynamic import) sau khi loadEnv() chay -
 * TypeScript/CJS hoist tat ca `import` tinh len dau file bat ke vi tri trong
 * source, nen neu dung import tinh thi @/lib/mongodb/../src/models se duoc
 * require() truoc ca loadEnv(), khien bien moi truong chua kip nap.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Citizen } = await import("../src/models");
    const { isEncryptedSensitive } = await import("../src/lib/encryption");

    await connectDB();

    const citizens = await Citizen.find({
        $or: [
            { phone: { $exists: true, $ne: null } },
            { cccd: { $exists: true, $ne: null } },
        ],
    });
    console.log(
        `Tim thay ${citizens.length} nhan khau co phone/cccd can kiem tra.`,
    );

    let updated = 0;
    for (const citizen of citizens) {
        let changed = false;
        if (citizen.phone && !isEncryptedSensitive(citizen.phone)) {
            citizen.markModified("phone");
            changed = true;
        }
        if (citizen.cccd && !isEncryptedSensitive(citizen.cccd)) {
            citizen.markModified("cccd");
            changed = true;
        }
        if (changed) {
            // eslint-disable-next-line no-await-in-loop
            await citizen.save();
            updated += 1;
        }
    }

    console.log(`\nHoan tat. Da ma hoa ${updated} ban ghi nhan khau.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
