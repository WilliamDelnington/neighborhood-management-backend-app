/* eslint-disable no-console */
/**
 * Phuc hoi database tu mot ban sao luu tao boi scripts/backup-db.ts (thu muc
 * backups/<timestamp>/). Voi MOI collection co file .json trong thu muc do:
 * xoa toan bo du lieu hien tai cua collection roi nap lai dung du lieu trong
 * file sao luu (deleteMany({}) + insertMany). Collection nao KHONG co file
 * trong ban sao luu se KHONG bi dong den.
 *
 * Chay: npm run restore                 (dung ban sao luu MOI NHAT)
 *       npm run restore -- 2026-08-03T10-00-00-000Z   (dung ban chi dinh)
 *       npm run restore -- --yes         (bo qua hoi xac nhan - vd script)
 *
 * Khac voi seed.ts: KHONG chan cung o NODE_ENV=production, vi phuc hoi tu ban
 * sao luu chinh la thao tac can dung khi can khac phuc su co - kem ca khi su
 * co xay ra tren production. Van hoi xac nhan truoc khi ghi de (bo qua duoc
 * bang --yes/-y/RESTORE_SKIP_CONFIRM=true), vi day la thao tac XOA DU LIEU
 * HIEN TAI khong the hoan tac.
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
import readline from "readline";
import mongoose from "mongoose";
import { EJSON } from "bson";

const BACKUPS_ROOT = path.join(__dirname, "..", "backups");

function resolveBackupDir(): string {
    const arg = process.argv
        .slice(2)
        .find(a => a !== "--yes" && a !== "-y");

    if (arg) {
        const candidate = path.isAbsolute(arg) ? arg : path.join(BACKUPS_ROOT, arg);
        if (!fs.existsSync(candidate)) {
            throw new Error(`Không tìm thấy thư mục sao lưu: ${candidate}`);
        }
        return candidate;
    }

    if (!fs.existsSync(BACKUPS_ROOT)) {
        throw new Error(
            "Chưa có bản sao lưu nào (thư mục backups/ không tồn tại) - chạy npm run backup trước.",
        );
    }
    const dirs = fs
        .readdirSync(BACKUPS_ROOT, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort();
    if (dirs.length === 0) {
        throw new Error(
            "Chưa có bản sao lưu nào trong backups/ - chạy npm run backup trước.",
        );
    }
    return path.join(BACKUPS_ROOT, dirs[dirs.length - 1]);
}

async function confirmRestore(backupDir: string, files: string[]): Promise<boolean> {
    const skip =
        process.argv.includes("--yes") ||
        process.argv.includes("-y") ||
        process.env.RESTORE_SKIP_CONFIRM === "true";
    if (skip) return true;

    console.log(`\n⚠️  CẢNH BÁO: sẽ XÓA dữ liệu hiện tại và nạp lại từ:`);
    console.log(`   ${backupDir}`);
    console.log(`   Các collection sẽ bị ghi đè: ${files.map(f => f.replace(/\.json$/, "")).join(", ")}`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const answer = await new Promise<string>(resolve => {
        rl.question("\nBạn có chắc chắn muốn tiếp tục? (y/N): ", resolve);
    });
    rl.close();

    return /^y(es)?$/i.test(answer.trim());
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }

    const backupDir = resolveBackupDir();
    const files = fs
        .readdirSync(backupDir)
        .filter(f => f.endsWith(".json"));

    if (files.length === 0) {
        throw new Error(`Không có file .json nào trong ${backupDir}`);
    }

    const confirmed = await confirmRestore(backupDir, files);
    if (!confirmed) {
        console.log("\nĐã hủy - không có dữ liệu nào bị thay đổi.");
        process.exit(0);
    }

    console.log("\nĐang kết nối MongoDB...");
    await mongoose.connect(uri, { bufferCommands: false });
    const db = mongoose.connection.db;
    if (!db) throw new Error("Khong lay duoc ket noi database");

    let totalDocs = 0;
    for (const file of files) {
        const collectionName = file.replace(/\.json$/, "");
        const raw = fs.readFileSync(path.join(backupDir, file), "utf-8");
        const docs = EJSON.parse(raw) as Record<string, unknown>[];

        // eslint-disable-next-line no-await-in-loop
        await db.collection(collectionName).deleteMany({});
        if (docs.length > 0) {
            // eslint-disable-next-line no-await-in-loop
            await db.collection(collectionName).insertMany(docs);
        }
        console.log(`  ${collectionName}: ${docs.length} documents`);
        totalDocs += docs.length;
    }

    console.log(`\nHoàn tất. Đã phục hồi ${totalDocs} documents từ ${backupDir}.`);

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Phục hồi thất bại:", err);
    process.exit(1);
});
