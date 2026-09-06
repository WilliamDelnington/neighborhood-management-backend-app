/* eslint-disable no-console */
/**
 * Tao (idempotent, khong pha huy) mot RequestTypeDefinition cho MOI gia tri
 * cua REQUEST_TYPES (4 loai "he thong" cu, hardcode trong @/types: pccc,
 * security, other, task) - chuan bi bo dac cach built-in trong code
 * (xem requestTypeDefinitionService.ts) de nguoi co quyen quan tri mot loai
 * nhiem vu duy nhat qua man quan ly (RequestTypeListPage), khong con phan
 * biet "he thong" vs "tu tao".
 *
 * allowedSenderRoles/allowedReceiverRoles duoc TINH TAI THOI DIEM CHAY, doi
 * chieu voi Role dang co trong DB (khong hardcode tu systemRoles.ts), de tai
 * hien DUNG hanh vi hien tai truoc khi co script nay:
 *   - allowedSenderRoles = moi vai tro dang giu quyen "requests.create" - day
 *     la dieu kien gui THAT SU duy nhat ap dung cho ca 4 loai built-in hien
 *     nay (khong co gioi han rieng theo tung loai).
 *   - allowedReceiverRoles: pccc/security/other lay tu quyen
 *     "${key}.assign" tuong ung (dung dung nguoi hien dang nhan duoc loai do).
 *     Rieng "task" KHONG co quyen "task.assign" nao tung duoc dang ky (day
 *     chinh la nguyen nhan loi "Nhiệm vụ khong co ai de giao" ma script nay
 *     sua) nen duoc seed voi mac dinh ["neighborhood_leader",
 *     "neighborhood_coleader"] (giong "other" - loai gan nhat, cung la nguoi
 *     phu trach chung cua to dan pho) - CHI la gia tri khoi tao, nguoi co
 *     quyen quan tri co the doi ngay sau khi seed qua RequestTypeListPage.
 *
 * An toan de chay lai nhieu lan:
 *   - Moi loai duoc dinh danh boi `key` (unique); da ton tai thi KHONG ghi de
 *     name/allowedSenderRoles/allowedReceiverRoles/active/fields/dataEntryMode
 *     - cac truong nay chi duoc dat luc TAO MOI, tranh xoa mat tuy chinh cua
 *     nguoi quan tri qua man quan ly giua cac lan chay.
 *   - isBuiltIn luon duoc dam bao la true cho cac key nay, ke ca khi chay lai
 *     sau khi da ton tai.
 *
 * Chay: npm run seed:request-types   (hoac: tsx scripts/seed-request-types.ts)
 *
 * LUU Y DNS / IMPORT MODELS: xem giai thich chi tiet trong
 * scripts/seed-neighborhoods.ts - phai loadEnv()/dns.setServers() TRUOC, va chi
 * import cac module dong den @/lib/encryption (qua models barrel) bang dynamic
 * import() SAU khi loadEnv() da chay.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import dns from "dns";

const dnsServers = (process.env.MONGODB_DNS_SERVERS || "1.1.1.1,8.8.8.8")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
if (dnsServers.length) {
    dns.setServers(dnsServers);
}

import mongoose from "mongoose";

// Mac dinh khoi tao rieng cho "task" - xem ghi chu dau file. Khong ap dung
// cho pccc/security/other (tinh tu quyen "${key}.assign" that su o duoi).
const TASK_DEFAULT_RECEIVER_ROLES = ["neighborhood_leader", "neighborhood_coleader"];

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }

    console.log("Dang ket noi MongoDB...");
    await mongoose.connect(uri, { bufferCommands: false });

    const { User, RequestTypeDefinition } = await import("../src/models");
    const { REQUEST_TYPES, REQUEST_TYPE_LABEL } = await import("../src/types");
    const { getRoleKeysWithPermission } = await import("../src/lib/rbac");

    const admin = await User.findOne({ roles: "admin" }).sort({ createdAt: 1 });
    if (!admin) {
        throw new Error(
            "Khong tim thay tai khoan admin nao - can it nhat 1 admin de ghi createdBy/updatedBy (chay npm run seed truoc)",
        );
    }
    const actorId = admin._id;

    const allowedSenderRoles = await getRoleKeysWithPermission("requests.create");

    let createdCount = 0;
    let alreadyExistedCount = 0;

    for (const key of REQUEST_TYPES) {
        const allowedReceiverRoles =
            key === "task"
                ? TASK_DEFAULT_RECEIVER_ROLES
                // eslint-disable-next-line no-await-in-loop
                : await getRoleKeysWithPermission(`${key}.assign`);

        console.log(`\n"${key}" (${REQUEST_TYPE_LABEL[key]}):`);
        console.log(`  allowedSenderRoles:   ${allowedSenderRoles.join(", ") || "(rỗng)"}`);
        console.log(`  allowedReceiverRoles: ${allowedReceiverRoles.join(", ") || "(rỗng)"}`);

        // eslint-disable-next-line no-await-in-loop
        const existing = await RequestTypeDefinition.findOne({ key }).select("_id");
        if (existing) {
            // isBuiltIn phai luon la true cho cac key nay du ban ghi da ton
            // tai truoc do - day la truong duy nhat duoc phep ghi de tren ban
            // ghi da co. Khong dong den name/allowedSenderRoles/
            // allowedReceiverRoles/active - tranh xoa mat tuy chinh cua nguoi
            // quan tri qua man quan ly.
            // eslint-disable-next-line no-await-in-loop
            await RequestTypeDefinition.updateOne(
                { _id: existing._id },
                { $set: { isBuiltIn: true } },
            );
            alreadyExistedCount += 1;
            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await RequestTypeDefinition.create({
            key,
            name: REQUEST_TYPE_LABEL[key],
            fields: [],
            allowedSenderRoles,
            allowedReceiverRoles,
            dataEntryMode: "sender",
            isBuiltIn: true,
            active: true,
            createdBy: actorId,
            updatedBy: actorId,
        });
        createdCount += 1;
    }

    console.log("\n==============================================");
    console.log(`Loai nhiem vu tao moi:    ${createdCount}`);
    console.log(`Loai nhiem vu da ton tai: ${alreadyExistedCount}`);
    console.log(`Tong so loai (REQUEST_TYPES): ${REQUEST_TYPES.length}`);
    console.log("==============================================");

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Seed loai nhiem vu that bai:", err);
    process.exit(1);
});
