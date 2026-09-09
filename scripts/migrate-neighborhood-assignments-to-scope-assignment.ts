/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Sao chep du lieu (ca active lan lich su) tu 3 bang rieng le cu
 * (NeighborhoodLeaderAssignment/NeighborhoodColeaderAssignment/
 * NeighborhoodCollaboratorAssignment) sang collection ScopeAssignment chung
 * moi (xem models/ScopeAssignment.ts) - phan "du lieu" cua viec gop 3 bang To
 * dan pho vao 1 co che chung voi cap Phuong (Config-Driven Account Scope
 * System). Code ung dung (neighborhoodService.ts) DA doc/ghi truc tiep vao
 * ScopeAssignment tu sau khi trien khai ban update nay - script nay CHI backfill
 * DU LIEU DA CO TRUOC DO (assignment tao truoc khi code chuyen sang) de khong
 * mat lich su phan cong To truong/To pho/Cong tac vien.
 *
 * AN TOAN de chay tren du lieu thuc (dev/production) va chay lai nhieu lan:
 * - CHI DOC 3 bang cu, KHONG xoa/sua gi tren do ca - giu nguyen lam ban sao
 *   du phong/doi chieu (co the xoa hoan toan sau khi xac nhan on dinh mot thoi
 *   gian, xem ghi chu o cuoi script).
 * - Idempotent: voi moi ban ghi nguon, kiem tra da ton tai ban ghi
 *   ScopeAssignment tuong ung (khop theo roleKey+scopeId+userId+assignedAt)
 *   truoc khi tao moi - chay lai khong tao trung.
 * - KHONG dong den User/Neighborhood/... - cac truong denormalize
 *   (Neighborhood.leaderUserId, User.neighborhoodId/assignedNeighborhoodIds)
 *   la du lieu SAN CO tu truoc (duoc chinh cac ham assign/unassign cu ghi),
 *   khong can dong bo lai o day.
 *
 * Cac module cua app phai duoc import DONG (dynamic import) sau khi loadEnv()
 * chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const {
        NeighborhoodLeaderAssignment,
        NeighborhoodColeaderAssignment,
        NeighborhoodCollaboratorAssignment,
        ScopeAssignment,
    } = await import("../src/models");

    if (!process.env.MONGODB_URI) {
        throw new Error("Missing MONGODB_URI (check .env.local)");
    }
    await connectDB();

    let migrated = 0;
    let skippedExisting = 0;

    // --- To truong ---
    const leaderRows = await NeighborhoodLeaderAssignment.find({});
    console.log(`NeighborhoodLeaderAssignment: ${leaderRows.length} ban ghi nguon.`);
    for (const row of leaderRows) {
        const scopeId = String(row.neighborhoodId);
        // eslint-disable-next-line no-await-in-loop
        const exists = await ScopeAssignment.exists({
            roleKey: "neighborhood_leader",
            scopeType: "NEIGHBORHOOD",
            scopeId,
            userId: row.leaderUserId,
            assignedAt: row.assignedAt,
        });
        if (exists) {
            skippedExisting += 1;
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await ScopeAssignment.create({
            roleKey: "neighborhood_leader",
            scopeType: "NEIGHBORHOOD",
            scopeId,
            userId: row.leaderUserId,
            assignedAt: row.assignedAt,
            assignedBy: row.assignedBy,
            unassignedAt: row.unassignedAt,
            unassignedBy: row.unassignedBy,
            note: row.note,
        });
        migrated += 1;
    }

    // --- To pho ---
    const coleaderRows = await NeighborhoodColeaderAssignment.find({});
    console.log(`NeighborhoodColeaderAssignment: ${coleaderRows.length} ban ghi nguon.`);
    for (const row of coleaderRows) {
        const scopeId = String(row.neighborhoodId);
        // eslint-disable-next-line no-await-in-loop
        const exists = await ScopeAssignment.exists({
            roleKey: "neighborhood_coleader",
            scopeType: "NEIGHBORHOOD",
            scopeId,
            userId: row.coleaderUserId,
            assignedAt: row.assignedAt,
        });
        if (exists) {
            skippedExisting += 1;
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await ScopeAssignment.create({
            roleKey: "neighborhood_coleader",
            scopeType: "NEIGHBORHOOD",
            scopeId,
            userId: row.coleaderUserId,
            assignedAt: row.assignedAt,
            assignedBy: row.assignedBy,
            unassignedAt: row.unassignedAt,
            unassignedBy: row.unassignedBy,
            note: row.note,
        });
        migrated += 1;
    }

    // --- Cong tac vien ---
    const collaboratorRows = await NeighborhoodCollaboratorAssignment.find({});
    console.log(
        `NeighborhoodCollaboratorAssignment: ${collaboratorRows.length} ban ghi nguon.`,
    );
    for (const row of collaboratorRows) {
        const scopeId = String(row.neighborhoodId);
        // eslint-disable-next-line no-await-in-loop
        const exists = await ScopeAssignment.exists({
            roleKey: "neighborhood_collaborator",
            scopeType: "NEIGHBORHOOD",
            scopeId,
            userId: row.collaboratorUserId,
            assignedAt: row.startAt,
        });
        if (exists) {
            skippedExisting += 1;
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await ScopeAssignment.create({
            roleKey: "neighborhood_collaborator",
            scopeType: "NEIGHBORHOOD",
            scopeId,
            userId: row.collaboratorUserId,
            assignedAt: row.startAt,
            endAt: row.endAt,
            assignedBy: row.assignedBy,
            unassignedAt: row.unassignedAt,
            unassignedBy: row.unassignedBy,
            note: row.note,
            subScope: {
                kind: row.scopeType,
                streetId: row.streetId,
                houseIds: row.houseIds,
                campaignId: row.campaignId,
            },
        });
        migrated += 1;
    }

    console.log(
        `\nHoan tat. Da sao chep ${migrated} ban ghi moi sang ScopeAssignment, ` +
            `bo qua ${skippedExisting} ban ghi (da ton tai tu lan chay truoc).`,
    );
    console.log(
        "3 bang cu (NeighborhoodLeaderAssignment/NeighborhoodColeaderAssignment/" +
            "NeighborhoodCollaboratorAssignment) KHONG bi dong den - giu nguyen lam " +
            "ban sao doi chieu. Sau khi xac nhan on dinh (vd sau 1 chu ky release), " +
            "co the xoa cac collection nay thu cong neu muon don dep.",
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
