import { ImportJob } from "@/models";

/**
 * Don dep ImportJob - moi job luu HAI ban sao du lieu cua file Excel
 * (rawRows: gia tri goc tung dong, previewData: dong da parse cho buoc commit),
 * ke ca so dien thoai/CCCD... Truoc day KHONG co gi xoa chung: job bo do (dong
 * dialog giua chung), job ket thuc, job treo "committing" sau khi server khoi
 * dong lai deu nam mai trong DB, ton dung luong va giu ban sao du lieu ca nhan
 * ngoai cac collection chinh.
 *
 * Quy tac (thoi han cau hinh qua bien moi truong, xem readCleanupConfig):
 * 1. Job CHUA commit (awaiting_mapping/previewing/validated) khong cap nhat
 *    qua IMPORT_JOB_ABANDONED_HOURS (mac dinh 24h) -> xoa han (khong the tiep
 *    tuc tu giao dien - dialog import luon bat dau lai tu dau).
 * 2. Job "committing" khong co tien do qua IMPORT_JOB_STALE_COMMIT_MINUTES
 *    (mac dinh 30 phut - vong lap commit cap nhat tien do moi 5 dong nen mot
 *    job con chay khong bao gio im lang lau nhu vay) -> danh dau "failed" (bi
 *    gian doan, vd server khoi dong lai giua chung).
 * 3. Job da ket thuc (committed/failed) -> bo previewData, chi giu rawRows
 *    cua cac dong nam trong rowErrors (de "Xuất dòng lỗi" van dung duoc).
 * 4. Job da ket thuc qua IMPORT_JOB_RETENTION_DAYS (mac dinh 30 ngay) -> xoa han.
 */

const FINISHED_STATUSES = ["committed", "failed"];
const UNFINISHED_STATUSES = ["awaiting_mapping", "previewing", "validated"];

function readNumberEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function readCleanupConfig() {
    return {
        abandonedHours: readNumberEnv("IMPORT_JOB_ABANDONED_HOURS", 24),
        staleCommitMinutes: readNumberEnv("IMPORT_JOB_STALE_COMMIT_MINUTES", 30),
        retentionDays: readNumberEnv("IMPORT_JOB_RETENTION_DAYS", 30),
    };
}

export type ImportJobCleanupResult = {
    abandonedDeleted: number;
    staleMarkedFailed: number;
    pruned: number;
    expiredDeleted: number;
};

export async function cleanupImportJobs(
    now: Date = new Date(),
    config = readCleanupConfig(),
): Promise<ImportJobCleanupResult> {
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

    const abandoned = await ImportJob.deleteMany({
        status: { $in: UNFINISHED_STATUSES },
        updatedAt: { $lt: hoursAgo(config.abandonedHours) },
    });

    const stale = await ImportJob.updateMany(
        {
            status: "committing",
            updatedAt: { $lt: hoursAgo(config.staleCommitMinutes / 60) },
        },
        { $set: { status: "failed" } },
    );

    // Tung job mot (khong gop) - moi job co the lon, tranh nap nhieu job vao
    // bo nho cung luc.
    let pruned = 0;
    const toPrune = ImportJob.find({
        status: { $in: FINISHED_STATUSES },
        pruned: { $ne: true },
    })
        .select("_id rawRows rowErrors")
        .cursor();
    for await (const job of toPrune) {
        const errorRowNumbers = new Set(job.rowErrors.map(e => e.row));
        const keptRawRows = (job.rawRows || []).filter(r =>
            errorRowNumbers.has(r.rowNumber),
        );
        await ImportJob.updateOne(
            { _id: job._id, status: { $in: FINISHED_STATUSES } },
            // timestamps:false - giu nguyen updatedAt (thoi diem job ket thuc)
            // de quy tac xoa theo IMPORT_JOB_RETENTION_DAYS tinh dung.
            { $set: { previewData: [], rawRows: keptRawRows, pruned: true } },
            { timestamps: false },
        );
        pruned += 1;
    }

    const expired = await ImportJob.deleteMany({
        status: { $in: FINISHED_STATUSES },
        updatedAt: { $lt: hoursAgo(config.retentionDays * 24) },
    });

    return {
        abandonedDeleted: abandoned.deletedCount || 0,
        staleMarkedFailed: stale.modifiedCount || 0,
        pruned,
        expiredDeleted: expired.deletedCount || 0,
    };
}
