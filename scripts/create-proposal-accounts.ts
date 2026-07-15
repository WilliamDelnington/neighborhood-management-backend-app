/* eslint-disable no-console */
/**
 * Tao 30 tai khoan cong vu theo De an thi diem "To dan pho so" phuong Duong Noi:
 *   - 09 tai khoan Phong Van hoa - Xa hoi (role: people_committee_official)
 *   - 21 tai khoan cho 21 to dan pho, moi to 01 tai khoan (role: neighborhood_leader)
 *
 * Script CHAY BO SUNG (non-destructive): KHONG xoa du lieu hien co. Moi tai khoan
 * duoc dinh danh bang so dien thoai (phone) nen co the chay lai nhieu lan ma khong
 * tao trung (idempotent) - tai khoan da ton tai se duoc bo qua.
 *
 * Chay: npm run seed:proposal   (hoac: tsx scripts/create-proposal-accounts.ts)
 *
 * LUU Y QUAN TRONG (DNS): Script KHONG import @/lib/mongodb vi module do goi
 * dns.setServers() ngay khi duoc import (truoc khi dotenv doc .env.local), khien
 * bien MONGODB_DNS_SERVERS chua duoc nap -> SRV lookup that bai voi loi
 * "querySrv ECONNREFUSED". O day ta nap .env TRUOC, roi tu goi dns.setServers()
 * roi moi ket noi truc tiep bang mongoose.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import dns from "dns";

// Ap dung resolver tuy chinh SAU khi da nap env va TRUOC khi ket noi, de tranh
// loi querySrv ECONNREFUSED tren mang chan DNS SRV mac dinh.
const dnsServers = (process.env.MONGODB_DNS_SERVERS || "1.1.1.1,8.8.8.8")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
if (dnsServers.length) {
    dns.setServers(dnsServers);
}

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/models";

/**
 * Mat khau dung chung cho tat ca tai khoan cong vu duoc tao trong dot thi diem.
 * Dang nhap trang quan tri web bang: so dien thoai + mat khau nay.
 * NEN doi mat khau sau khi ban giao tai khoan cho tung don vi.
 */
const DEFAULT_PASSWORD = "DuongNoi@2026";

// 09 can bo Phong Van hoa - Xa hoi, bam theo cac linh vuc cong tac trong De an.
const DEPARTMENT_STAFF: Array<{ suffix: string; name: string }> = [
    { suffix: "01", name: "Cán bộ Phòng VHXH - Lãnh đạo phòng" },
    { suffix: "02", name: "Cán bộ phụ trách Y tế" },
    { suffix: "03", name: "Cán bộ phụ trách Giáo dục" },
    { suffix: "04", name: "Cán bộ phụ trách Văn hóa - Thể thao" },
    { suffix: "05", name: "Cán bộ phụ trách An sinh xã hội" },
    { suffix: "06", name: "Cán bộ phụ trách Dân số - Trẻ em" },
    { suffix: "07", name: "Cán bộ phụ trách Thông tin - Tuyên truyền" },
    { suffix: "08", name: "Cán bộ tổng hợp báo cáo" },
    { suffix: "09", name: "Cán bộ đầu mối quản trị hệ thống" },
];

const TOTAL_TDP = 21;

type SeedUser = {
    displayName: string;
    phone: string;
    email: string;
    address?: string;
    roles: string[];
    primaryRole: string;
    assignedClusters?: string[];
};

function buildAccounts(): SeedUser[] {
    const accounts: SeedUser[] = [];

    // 09 tai khoan Phong Van hoa - Xa hoi
    DEPARTMENT_STAFF.forEach((staff, i) => {
        accounts.push({
            displayName: staff.name,
            phone: `09200000${String(i + 1).padStart(2, "0")}`,
            email: `vhxh${staff.suffix}@duongnoi.gov.vn`,
            address: "Phòng Văn hóa - Xã hội, UBND phường Dương Nội",
            roles: ["people_committee_official"],
            primaryRole: "people_committee_official",
        });
    });

    // 21 tai khoan to dan pho (moi to 01 tai khoan)
    for (let n = 1; n <= TOTAL_TDP; n += 1) {
        const suffix = String(n).padStart(2, "0");
        accounts.push({
            displayName: `Tổ trưởng Tổ dân phố số ${n}`,
            phone: `09300000${suffix}`,
            email: `tdp${suffix}@duongnoi.gov.vn`,
            address: `Tổ dân phố số ${n}, phường Dương Nội`,
            roles: ["neighborhood_leader"],
            primaryRole: "neighborhood_leader",
            assignedClusters: [`Tổ dân phố số ${n}`],
        });
    }

    return accounts;
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }

    console.log(`DNS servers: ${dns.getServers().join(", ")}`);
    console.log("Dang ket noi MongoDB...");
    await mongoose.connect(uri, { bufferCommands: false });

    const before = await User.countDocuments();
    console.log(`So tai khoan hien co: ${before}`);

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const accounts = buildAccounts();
    let created = 0;
    let skipped = 0;

    for (const acc of accounts) {
        // eslint-disable-next-line no-await-in-loop
        const existing = await User.findOne({ phone: acc.phone }).lean();

        if (existing) {
            skipped += 1;
            console.log(`  [BO QUA] Da ton tai: ${acc.displayName} (${acc.phone})`);
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await User.create({
            ...acc,
            passwordHash,
            status: "active",
            permissions: [],
            notificationPermission: true,
            sessionVersion: 0,
        });
        created += 1;
        console.log(`  [TAO MOI] ${acc.displayName} -> ${acc.phone}`);
    }

    const after = await User.countDocuments();

    console.log("\n==============================================");
    console.log(`Tong tai khoan trong De an:  ${accounts.length}`);
    console.log(`  - Phong Van hoa - Xa hoi:  ${DEPARTMENT_STAFF.length}`);
    console.log(`  - To dan pho:              ${TOTAL_TDP}`);
    console.log(`Tao moi lan nay:             ${created}`);
    console.log(`Da ton tai (bo qua):         ${skipped}`);
    console.log(`Tong user: ${before} -> ${after}`);
    console.log("----------------------------------------------");
    console.log(`Mat khau dang nhap chung:    ${DEFAULT_PASSWORD}`);
    console.log("So dien thoai:");
    console.log("  Phong VHXH:  0920000001 - 0920000009");
    console.log("  To dan pho:  0930000001 - 0930000021");
    console.log("==============================================");

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Tao tai khoan that bai:", err);
    process.exit(1);
});
