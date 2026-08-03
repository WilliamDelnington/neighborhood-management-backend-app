/* eslint-disable no-console */
/**
 * Sao luu TOAN BO database (moi collection, khong chi cac model biet truoc)
 * ra file JSON dang Extended JSON (EJSON, giu nguyen kieu du lieu that -
 * ObjectId, Date... - khac JSON.stringify thuong se lam mat kieu) trong thu
 * muc backups/<timestamp>/. Dung truc tiep native driver cua mongoose
 * (mongoose.connection.db), KHONG import cac model (@/models) - vua don gian
 * hon (khong can biet truoc danh sach collection), vua tranh hoan toan van de
 * hoist import tinh gap phai o scripts/seed.ts (Citizen -> @/lib/encryption
 * doc ENCRYPTION_KEY luc import).
 *
 * An toan tuyet doi de chay bat ky luc nao (chi doc du lieu, khong ghi/xoa gi
 * ca) - khong can hoi xac nhan nhu seed.ts/restore-db.ts.
 *
 * Chay: npm run backup
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

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { EJSON } from "bson";

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }

    console.log("Dang ket noi MongoDB...");
    await mongoose.connect(uri, { bufferCommands: false });
    const db = mongoose.connection.db;
    if (!db) throw new Error("Khong lay duoc ket noi database");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(__dirname, "..", "backups", timestamp);
    fs.mkdirSync(outDir, { recursive: true });

    const collections = await db.listCollections().toArray();
    console.log(
        `\nTim thay ${collections.length} collection(s). Đang sao lưu vào ${outDir}...\n`,
    );

    let totalDocs = 0;
    for (const { name } of collections) {
        // eslint-disable-next-line no-await-in-loop
        const docs = await db.collection(name).find({}).toArray();
        const ejson = EJSON.stringify(docs, { relaxed: false });
        // Pretty-print lai (EJSON.stringify o tren la JSON hop le, chi khac
        // cach bieu dien ObjectId/Date/... bang $oid/$date - format lai
        // khong lam mat thong tin kieu du lieu) de de doc/diff khi can.
        const pretty = JSON.stringify(JSON.parse(ejson), null, 2);
        fs.writeFileSync(path.join(outDir, `${name}.json`), pretty, "utf-8");
        console.log(`  ${name}: ${docs.length} documents`);
        totalDocs += docs.length;
    }

    console.log(
        `\nHoàn tất. Tổng ${totalDocs} documents từ ${collections.length} collection(s).`,
    );
    console.log(`Thư mục sao lưu: ${outDir}`);
    console.log(
        `Phục hồi bằng: npm run restore -- ${timestamp}`,
    );

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Sao lưu thất bại:", err);
    process.exit(1);
});
