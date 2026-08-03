/* eslint-disable no-console */
/**
 * Tao (idempotent, khong pha huy) 21 tai khoan neighborhood_leader, moi tai
 * khoan dai dien mot to dan pho chinh thuc TDP-01..TDP-21 (xem
 * scripts/seed-neighborhoods.ts), roi gan lam to truong cho dung to dan pho
 * do bang chinh service dang dung o API (neighborhoodService.assignNeighborhoodLeader)
 * thay vi tu ghi de Neighborhood.leaderUserId/NeighborhoodLeaderAssignment thu
 * cong, de dam bao cung mot logic validate/audit nhu khi thao tac qua admin web.
 *
 * So dien thoai: 09300000{NN} (NN = so thu tu to dan pho, 2 chu so, 01..21).
 * Mat khau chung: xem DUONG_NOI_LEADER_PASSWORD ben duoi.
 *
 * An toan de chay lai nhieu lan:
 *   - Moi tai khoan duoc dinh danh boi `phone` (unique); da ton tai thi CHI cap
 *     nhat lai mat khau/vai tro/trang thai ve dung gia tri mong muon, khong tao
 *     trung.
 *   - assignNeighborhoodLeader tu no da idempotent (tra ve ngay neu dang la to
 *     truong hien tai cua dung to do).
 *
 * Chay: npm run seed:neighborhood-leaders
 *
 * LUU Y DNS / IMPORT MODELS: xem giai thich chi tiet trong
 * scripts/seed-neighborhoods.ts - phai loadEnv()/dns.setServers() TRUOC, va chi
 * import cac module dong den @/lib/encryption (qua models barrel) bang dynamic
 * import() SAU khi loadEnv() da chay, neu khong se nem loi "Thieu bien moi
 * truong ENCRYPTION_KEY".
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

const TOTAL_TDP = 21;
const DUONG_NOI_LEADER_PASSWORD = "DuongNoi@2026";

function buildPhone(n: number): string {
    return `09300000${String(n).padStart(2, "0")}`;
}

function buildCode(n: number): string {
    return `TDP-${String(n).padStart(2, "0")}`;
}

function buildDisplayName(n: number): string {
    return `Tổ trưởng Tổ dân phố ${String(n).padStart(2, "0")}`;
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }

    console.log("Dang ket noi MongoDB...");
    await mongoose.connect(uri, { bufferCommands: false });

    const { User, Neighborhood } = await import("../src/models");
    const { hashPassword } = await import("@/lib/auth");
    const { assignNeighborhoodLeader } = await import(
        "../src/services/neighborhoodService"
    );

    const admin = await User.findOne({ roles: "admin" }).sort({ createdAt: 1 });
    if (!admin) {
        throw new Error(
            "Khong tim thay tai khoan admin nao - can it nhat 1 admin de ghi assignedBy/createdBy (chay npm run seed truoc)",
        );
    }
    const actorId = String(admin._id);

    const passwordHash = await hashPassword(DUONG_NOI_LEADER_PASSWORD);

    let createdCount = 0;
    let updatedCount = 0;
    let assignedCount = 0;
    const missingNeighborhoods: string[] = [];

    for (let n = 1; n <= TOTAL_TDP; n += 1) {
        const phone = buildPhone(n);
        const displayName = buildDisplayName(n);

        // eslint-disable-next-line no-await-in-loop
        const existing = await User.findOne({ phone });
        let user: any;
        if (existing) {
            existing.passwordHash = passwordHash;
            existing.displayName = displayName;
            existing.status = "active";
            if (!existing.roles.includes("neighborhood_leader")) {
                existing.roles.push("neighborhood_leader");
            }
            existing.primaryRole = "neighborhood_leader";
            existing.updatedBy = actorId as any;
            // eslint-disable-next-line no-await-in-loop
            await existing.save();
            user = existing;
            updatedCount += 1;
        } else {
            // eslint-disable-next-line no-await-in-loop
            user = await User.create({
                displayName,
                phone,
                passwordHash,
                roles: ["neighborhood_leader"],
                primaryRole: "neighborhood_leader",
                status: "active",
                createdBy: actorId,
                updatedBy: actorId,
            });
            createdCount += 1;
        }

        // eslint-disable-next-line no-await-in-loop
        const neighborhood = await Neighborhood.findOne({ code: buildCode(n) });
        if (!neighborhood) {
            missingNeighborhoods.push(buildCode(n));
            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await assignNeighborhoodLeader(
            actorId,
            String(neighborhood._id),
            String(user._id),
            "Seed tu dong boi scripts/seed-neighborhood-leaders.ts",
        );
        assignedCount += 1;
    }

    console.log("\n==============================================");
    console.log(`Tai khoan to truong tao moi:     ${createdCount}`);
    console.log(`Tai khoan to truong cap nhat lai: ${updatedCount}`);
    console.log(`Da gan lam to truong cua to:      ${assignedCount}`);
    if (missingNeighborhoods.length > 0) {
        console.log(
            `\nKHONG TIM THAY to dan pho cho cac ma sau (chay npm run seed:neighborhoods truoc):`,
        );
        missingNeighborhoods.forEach(code => console.log(`  - ${code}`));
    }
    console.log(`\nSo dien thoai: 09300000{01..21}, mat khau chung: ${DUONG_NOI_LEADER_PASSWORD}`);
    console.log("==============================================");

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Seed to truong tung to dan pho that bai:", err);
    process.exit(1);
});
