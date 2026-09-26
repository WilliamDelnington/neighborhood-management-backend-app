/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Bao cao dung luong ImportJob theo trang thai (CHI DOC) - de biet cac ban sao
 * du lieu Excel (rawRows/previewData) dang chiem bao nhieu. Them --cleanup de
 * chay ngay quy tac don dep (giong job dinh ky, xem
 * services/importJobCleanupService.ts) thay vi doi lich cron.
 *
 * Cach chay:
 *   npm run imports:report
 *   npm run imports:report -- --cleanup [--yes]
 * Tren database production, --cleanup phai xac nhan (go ten database, hoac --yes).
 */
const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
};

async function printReport(label: string) {
    const { ImportJob } = await import("../src/models");
    const rows = await ImportJob.aggregate<{
        _id: string;
        count: number;
        totalBytes: number;
        maxBytes: number;
        oldest: Date;
    }>([
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalBytes: { $sum: { $bsonSize: "$$ROOT" } },
                maxBytes: { $max: { $bsonSize: "$$ROOT" } },
                oldest: { $min: "$updatedAt" },
            },
        },
        { $sort: { totalBytes: -1 } },
    ]);
    console.log(`\n${label}`);
    if (rows.length === 0) {
        console.log("  (no import jobs)");
        return;
    }
    let total = 0;
    for (const row of rows) {
        total += row.totalBytes;
        console.log(
            `  ${row._id.padEnd(17)} ${String(row.count).padStart(5)} jobs  ${formatBytes(row.totalBytes).padStart(10)}  (largest ${formatBytes(row.maxBytes)}, oldest update ${row.oldest.toISOString().slice(0, 10)})`,
        );
    }
    console.log(`  ${"TOTAL".padEnd(17)} ${formatBytes(total).padStart(22)}`);
}

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();
    const args = process.argv.slice(2);
    const runCleanup = args.includes("--cleanup");
    const assumeYes = args.includes("--yes") || args.includes("-y");

    if (!process.env.MONGODB_URI) throw new Error("Missing MONGODB_URI (check .env.local)");
    const { connectDB } = await import("@/lib/mongodb");
    await connectDB();

    await printReport("Import jobs by status:");
    if (!runCleanup) return;

    const { confirmProductionTarget } = await import("./lib/cliPrompt");
    await confirmProductionTarget(process.env.MONGODB_URI, assumeYes);
    const { cleanupImportJobs, readCleanupConfig } = await import(
        "../src/services/importJobCleanupService"
    );
    const config = readCleanupConfig();
    console.log(
        `\nCleaning up (abandoned > ${config.abandonedHours}h, stalled commit > ${config.staleCommitMinutes}min, finished kept ${config.retentionDays} days)...`,
    );
    const result = await cleanupImportJobs(new Date(), config);
    console.log(
        `  deleted abandoned: ${result.abandonedDeleted}, marked interrupted: ${result.staleMarkedFailed}, pruned finished: ${result.pruned}, deleted expired: ${result.expiredDeleted}`,
    );
    await printReport("After cleanup:");
}

main()
    .catch(error => {
        console.error("Failed:", error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        const mongoose = await import("mongoose");
        if (mongoose.default.connection.readyState !== 0) {
            await mongoose.default.connection.close();
        }
    });
