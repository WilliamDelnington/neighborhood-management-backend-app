/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Sua du lieu CU (neu co): Role.allowedRequestTypes cua neighborhood_leader/
 * neighborhood_coleader dang bi ket o [] (rong) - nghia la "khong duoc gui
 * loai yeu cau nao ca" (xem getUserAllowedRequestTypes trong rbac.ts: [] KHAC
 * undefined, undefined moi la "khong gioi han"). Neu dung nhu vay, day la
 * NGUYEN NHAN THU HAI (doc lap voi allowedSenderRoles cua RequestTypeDefinition)
 * khien "Loại yêu cầu" trong form "Gửi yêu cầu" rong cho 2 vai tro nay, du
 * RequestTypeDefinition da duoc backfill dung.
 *
 * CHI unset (ve undefined = khong gioi han) cho DUNG 2 vai tro nay khi gia tri
 * hien tai la [] - khong dong den vai tro khac (mot vai tro tuy chinh KHAC co
 * the co chu dich gioi han con [], khong nen bi coi la loi mot cach chung
 * chung). To truong/To pho ro rang can gui duoc yeu cau (nhiem vu...) nen []
 * o day gan nhu chac chan la nham, khong phai chu dich.
 *
 * Chay: npm run repair:neighborhood-leader-allowed-request-types
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Role } = await import("../src/models");

    await connectDB();

    const roles = await Role.find({
        key: { $in: ["neighborhood_leader", "neighborhood_coleader"] },
    }).select("key allowedRequestTypes");

    let fixedCount = 0;
    for (const role of roles) {
        const raw = (role as unknown as { allowedRequestTypes?: string[] })
            .allowedRequestTypes;
        if (Array.isArray(raw) && raw.length === 0) {
            // eslint-disable-next-line no-await-in-loop
            await Role.updateOne(
                { _id: role._id },
                { $unset: { allowedRequestTypes: "" } },
            );
            console.log(`"${role.key}": da go gioi han (allowedRequestTypes: [] -> khong gioi han).`);
            fixedCount += 1;
        } else {
            console.log(`"${role.key}": khong can sua (allowedRequestTypes=${JSON.stringify(raw)}).`);
        }
    }

    console.log(`\nHoan tat. Da sua ${fixedCount}/${roles.length} vai tro.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
