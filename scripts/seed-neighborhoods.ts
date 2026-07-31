/* eslint-disable no-console */
/**
 * Tao (idempotent, khong pha huy) 21 to dan pho chinh thuc TDP-01..TDP-21, roi
 * co gang tu dong lien ket cac tai khoan neighborhood_leader da co san (vd tao
 * boi scripts/create-proposal-accounts.ts, assignedClusters dang la
 * "Tổ dân phố số {n}") lam to truong cho to dan pho tuong ung theo so thu tu.
 *
 * An toan de chay lai nhieu lan:
 *   - Moi to dan pho duoc dinh danh boi `code`; cac truong seed (name/sequence/
 *     active) chi duoc dat luc TAO MOI ($setOnInsert) - KHONG bao gio ghi de
 *     dia chi/ghi chu/to truong da duoc admin chinh sua.
 *   - Chi tu dong gan to truong cho to dan pho CHUA co to truong active, va
 *     chi lien ket user CHUA co neighborhoodId - khong dong den phan cong da
 *     ton tai.
 *
 * Chay: npm run seed:neighborhoods   (hoac: tsx scripts/seed-neighborhoods.ts)
 *
 * LUU Y DNS: xem giai thich chi tiet trong scripts/create-proposal-accounts.ts -
 * phai nap .env TRUOC roi moi tu goi dns.setServers(), truoc khi ket noi.
 *
 * LUU Y IMPORT MODELS: "../src/models" (barrel) re-export ca Citizen, va
 * Citizen keo theo @/lib/encryption doc bien moi truong ENCRYPTION_KEY NGAY
 * LUC IMPORT (module top-level, khong phai trong ham). TypeScript/tsx bien
 * dich import tinh (import ... from ...) thanh require() va HOIST len dau
 * file bat ke vi tri viet trong source - nen neu import barrel nay o dang
 * tinh, no se chay TRUOC ca loadEnv() ben duoi (du loadEnv() duoc viet truoc
 * trong code), gay loi "Thieu bien moi truong ENCRYPTION_KEY". Vi vay phai
 * import DONG (dynamic import()) trong main(), SAU khi loadEnv() da chay -
 * giong cach scripts/backfill-roles.ts va scripts/backfill-encrypt-citizens.ts
 * da lam. Chi dung "import type" (bi xoa hoan toan luc bien dich, khong con
 * dong den runtime) cho cac kieu du lieu duoi day.
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

type ModelsModule = typeof import("../src/models");

const TOTAL_TDP = 21;

function buildCode(n: number): string {
    return `TDP-${String(n).padStart(2, "0")}`;
}

function buildDefaultName(n: number): string {
    return `Tổ dân phố ${String(n).padStart(2, "0")}`;
}

/**
 * Rut so thu tu to dan pho tu mot chuoi cum dan cu tu do, ho tro ca hai kieu
 * dat ten da tung dung trong du an: "Tổ dân phố số {n}" (create-proposal-accounts.ts)
 * va "Tổ dân phố {NN}" (ten mac dinh cua Neighborhood). Tra ve null neu khong
 * khop duoc mau "to dan pho" nao (vd "Cụm 1" trong du lieu demo cu).
 */
function extractSequenceFromCluster(cluster: string): number | null {
    const match = cluster.match(/t[oổ]\s*d[aâ]n\s*ph[oố]\s*(?:s[oố]\s*)?(\d+)/i);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isInteger(n) && n >= 1 && n <= TOTAL_TDP ? n : null;
}

async function seedCanonicalNeighborhoods(Neighborhood: ModelsModule["Neighborhood"]) {
    let created = 0;
    let alreadyExisted = 0;

    for (let n = 1; n <= TOTAL_TDP; n += 1) {
        const code = buildCode(n);
        // eslint-disable-next-line no-await-in-loop
        const existed = await Neighborhood.exists({ code });
        // eslint-disable-next-line no-await-in-loop
        await Neighborhood.findOneAndUpdate(
            { code },
            {
                $setOnInsert: {
                    code,
                    sequence: n,
                    name: buildDefaultName(n),
                    active: true,
                },
            },
            { upsert: true, setDefaultsOnInsert: true },
        );
        if (existed) {
            alreadyExisted += 1;
        } else {
            created += 1;
        }
    }

    return { created, alreadyExisted };
}

async function autoLinkLeaders(
    actorId: string | undefined,
    Neighborhood: ModelsModule["Neighborhood"],
    NeighborhoodLeaderAssignment: ModelsModule["NeighborhoodLeaderAssignment"],
    User: ModelsModule["User"],
) {
    const leaders = await User.find({
        roles: "neighborhood_leader",
        neighborhoodId: { $exists: false },
    });

    let linked = 0;
    const unmatched: string[] = [];

    for (const leader of leaders) {
        const clusters = leader.assignedClusters || [];
        const sequence = clusters
            .map(extractSequenceFromCluster)
            .find(s => s !== null);

        if (sequence === undefined || sequence === null) {
            if (clusters.length > 0) {
                unmatched.push(`${leader.displayName} (${leader.phone || leader._id}) - cum: ${clusters.join(", ")}`);
            }
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const neighborhood = await Neighborhood.findOne({ sequence });
        if (!neighborhood || neighborhood.leaderUserId) {
            continue;
        }

        if (!actorId) {
            unmatched.push(
                `${leader.displayName} (${leader.phone || leader._id}) - khop TDP-${String(sequence).padStart(2, "0")} nhung khong co tai khoan admin de ghi assignedBy`,
            );
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await NeighborhoodLeaderAssignment.create({
            neighborhoodId: neighborhood._id,
            leaderUserId: leader._id,
            assignedBy: actorId,
            assignedAt: new Date(),
            note: "Tu dong lien ket boi scripts/seed-neighborhoods.ts",
        });
        // eslint-disable-next-line no-await-in-loop
        await Neighborhood.updateOne(
            { _id: neighborhood._id },
            { leaderUserId: leader._id, updatedBy: actorId },
        );
        // eslint-disable-next-line no-await-in-loop
        await User.updateOne(
            { _id: leader._id },
            {
                neighborhoodId: neighborhood._id,
                $addToSet: { assignedNeighborhoodIds: neighborhood._id },
            },
        );
        linked += 1;
    }

    return { linked, unmatched };
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }

    console.log("Dang ket noi MongoDB...");
    await mongoose.connect(uri, { bufferCommands: false });

    // Import dong (dynamic import), CHI sau khi loadEnv()/dns.setServers() da
    // chay o tren - xem giai thich chi tiet trong doc comment dau file.
    const { Neighborhood, NeighborhoodLeaderAssignment, User } = await import(
        "../src/models"
    );

    console.log(`\nDang seed ${TOTAL_TDP} to dan pho chinh thuc (TDP-01..TDP-${TOTAL_TDP})...`);
    const { created, alreadyExisted } = await seedCanonicalNeighborhoods(Neighborhood);

    const admin = await User.findOne({ roles: "admin" }).sort({ createdAt: 1 });
    const actorId = admin ? String(admin._id) : undefined;

    console.log("\nDang tu dong lien ket to truong tu assignedClusters hien co...");
    const { linked, unmatched } = await autoLinkLeaders(
        actorId,
        Neighborhood,
        NeighborhoodLeaderAssignment,
        User,
    );

    console.log("\n==============================================");
    console.log(`To dan pho tao moi:        ${created}`);
    console.log(`To dan pho da ton tai:     ${alreadyExisted}`);
    console.log(`To truong tu dong lien ket: ${linked}`);
    if (unmatched.length > 0) {
        console.log(`\nCAC TAI KHOAN neighborhood_leader CHUA KHOP DUOC (can admin xu ly thu cong):`);
        unmatched.forEach(line => console.log(`  - ${line}`));
    }
    console.log("==============================================");

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Seed to dan pho that bai:", err);
    process.exit(1);
});
