import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { ImportJob } from "@/models";
import { cleanupImportJobs } from "@/services/importJobCleanupService";

const NOW = new Date("2026-09-25T12:00:00.000Z");
const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const CONFIG = { abandonedHours: 24, staleCommitMinutes: 30, retentionDays: 30 };

// Chen thang qua collection (bo qua timestamps cua Mongoose) de dat updatedAt
// trong qua khu.
async function insertJob(status: string, updatedAt: Date, extra: Record<string, unknown> = {}) {
    const _id = new mongoose.Types.ObjectId();
    await ImportJob.collection.insertOne({
        _id,
        type: "house",
        status,
        fileName: "nha.xlsx",
        createdBy: new mongoose.Types.ObjectId(),
        headers: ["Mã"],
        rawRows: [
            { rowNumber: 2, values: { Mã: "A1" } },
            { rowNumber: 3, values: { Mã: "A2" } },
            { rowNumber: 4, values: { Mã: "" } },
        ],
        previewData: [{ code: "A1" }, { code: "A2" }],
        rowErrors: [{ row: 4, message: "Thiếu mã" }],
        skippedRows: [],
        createdAt: updatedAt,
        updatedAt,
        ...extra,
    });
    return _id;
}

describe("Don dep import job (cleanupImportJobs)", () => {
    it("xoa job chua commit bi bo do qua 24h, giu job vua tao", async () => {
        const oldPreview = await insertJob("validated", hoursBefore(25));
        const oldMapping = await insertJob("awaiting_mapping", hoursBefore(48));
        const recentPreview = await insertJob("validated", hoursBefore(2));

        const result = await cleanupImportJobs(NOW, CONFIG);

        expect(result.abandonedDeleted).toBe(2);
        expect(await ImportJob.exists({ _id: oldPreview })).toBeNull();
        expect(await ImportJob.exists({ _id: oldMapping })).toBeNull();
        expect(await ImportJob.exists({ _id: recentPreview })).not.toBeNull();
    });

    it("danh dau failed job 'committing' im lang qua 30 phut, khong dong vao job dang chay", async () => {
        const stalled = await insertJob("committing", hoursBefore(1));
        const running = await insertJob("committing", new Date(NOW.getTime() - 60_000));

        const result = await cleanupImportJobs(NOW, CONFIG);

        expect(result.staleMarkedFailed).toBe(1);
        expect((await ImportJob.findById(stalled))!.status).toBe("failed");
        const runningJob = await ImportJob.findById(running);
        expect(runningJob!.status).toBe("committing");
        expect(runningJob!.previewData).toHaveLength(2);
    });

    it("job da ket thuc: bo previewData, chi giu rawRows cua dong loi, giu nguyen updatedAt", async () => {
        const finishedAt = hoursBefore(3);
        const committed = await insertJob("committed", finishedAt);

        const result = await cleanupImportJobs(NOW, CONFIG);

        expect(result.pruned).toBe(1);
        const job = await ImportJob.findById(committed);
        expect(job!.pruned).toBe(true);
        expect(job!.previewData).toEqual([]);
        expect(job!.rawRows.map(r => r.rowNumber)).toEqual([4]);
        expect(job!.rowErrors).toHaveLength(1);
        expect(job!.updatedAt.toISOString()).toBe(finishedAt.toISOString());

        // Chay lai khong xu ly lai job da don gon.
        const again = await cleanupImportJobs(NOW, CONFIG);
        expect(again.pruned).toBe(0);
    });

    it("xoa han job da ket thuc qua 30 ngay", async () => {
        const expired = await insertJob("committed", hoursBefore(31 * 24));
        const kept = await insertJob("failed", hoursBefore(10 * 24));

        const result = await cleanupImportJobs(NOW, CONFIG);

        expect(result.expiredDeleted).toBe(1);
        expect(await ImportJob.exists({ _id: expired })).toBeNull();
        expect(await ImportJob.exists({ _id: kept })).not.toBeNull();
    });
});
