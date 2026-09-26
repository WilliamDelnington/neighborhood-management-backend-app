import cron from "node-cron";
import { connectDB } from "@/lib/mongodb";
import { checkPcccDeadlinesAndNotify } from "@/services/pcccService";
import { checkAppointmentRemindersAndNoShow } from "@/services/appointmentService";
import { checkOverdueComplaintsAndNotify } from "@/services/complaintService";
import { cleanupImportJobs } from "@/services/importJobCleanupService";

// next dev co the goi register() (xem src/instrumentation.ts) nhieu lan khi
// module server duoc bien dich lai - dung cờ toan cuc de dam bao job cron chi
// duoc dang ky mot lan cho moi process.
declare global {
    // eslint-disable-next-line no-var
    var __pcccDeadlineSchedulerStarted: boolean | undefined;
    // eslint-disable-next-line no-var
    var __appointmentSchedulerStarted: boolean | undefined;
    // eslint-disable-next-line no-var
    var __complaintOverdueSchedulerStarted: boolean | undefined;
    // eslint-disable-next-line no-var
    var __importJobCleanupSchedulerStarted: boolean | undefined;
}

async function runPcccDeadlineCheck() {
    try {
        await connectDB();
        const warned = await checkPcccDeadlinesAndNotify();
        if (warned > 0) {
            console.log(`[pccc-deadline] Da gui canh bao qua han cho ${warned} ban ghi`);
        }
    } catch (err) {
        console.error("[pccc-deadline] Loi khi kiem tra han khac phuc PCCC:", err);
    }
}

/**
 * Dang ky job kiem tra dinh ky cac bien ban PCCC qua han khac phuc. Chay trong
 * cung process Next.js (khong can worker/cron he thong rieng) - phu hop moi
 * truong chay tren may local. Lich chay cau hinh qua PCCC_DEADLINE_CRON (mac
 * dinh moi gio, dau gio).
 */
export function startPcccDeadlineScheduler(): void {
    if (global.__pcccDeadlineSchedulerStarted) return;
    global.__pcccDeadlineSchedulerStarted = true;

    const schedule = process.env.PCCC_DEADLINE_CRON || "0 * * * *";
    cron.schedule(schedule, runPcccDeadlineCheck);
    console.log(`[pccc-deadline] Da dang ky lich kiem tra han khac phuc: "${schedule}"`);

    // Chay ngay mot lan luc khoi dong (sau vai giay de connectDB kip san sang)
    // de tien kiem tra tren may local, khong phai doi den lan cron dau tien.
    setTimeout(runPcccDeadlineCheck, 5000);
}

async function runAppointmentRemindersAndNoShowCheck() {
    try {
        await connectDB();
        const { remindersSent, noShowMarked, lockedUsers } =
            await checkAppointmentRemindersAndNoShow();
        if (remindersSent > 0 || noShowMarked > 0 || lockedUsers > 0) {
            console.log(
                `[appointment-scheduler] Da nhac ${remindersSent} lich hen, danh dau ${noShowMarked} lich vang mat, tam khoa ${lockedUsers} tai khoan`,
            );
        }
    } catch (err) {
        console.error(
            "[appointment-scheduler] Loi khi kiem tra nhac lich/vang mat lich hen:",
            err,
        );
    }
}

/**
 * Dang ky job kiem tra dinh ky nhac lich hen sap toi va danh dau vang mat
 * (xem checkAppointmentRemindersAndNoShow trong appointmentService.ts) - cung
 * hinh dang voi startPcccDeadlineScheduler o tren (cung process Next.js, co
 * guard toan cuc, chay ngay mot lan luc khoi dong). Lich chay cau hinh qua
 * APPOINTMENT_REMINDER_CRON (mac dinh moi 5 phut, du gan de kip nhac truoc
 * gio hen va phat hien vang mat som sau khi qua han 15 phut).
 */
export function startAppointmentScheduler(): void {
    if (global.__appointmentSchedulerStarted) return;
    global.__appointmentSchedulerStarted = true;

    const schedule = process.env.APPOINTMENT_REMINDER_CRON || "*/5 * * * *";
    cron.schedule(schedule, runAppointmentRemindersAndNoShowCheck);
    console.log(
        `[appointment-scheduler] Da dang ky lich kiem tra nhac lich/vang mat: "${schedule}"`,
    );

    setTimeout(runAppointmentRemindersAndNoShowCheck, 5000);
}

async function runComplaintOverdueCheck() {
    try {
        await connectDB();
        const warned = await checkOverdueComplaintsAndNotify();
        if (warned > 0) {
            console.log(`[complaint-overdue] Da canh bao ${warned} phan anh qua han 24h`);
        }
    } catch (err) {
        console.error("[complaint-overdue] Loi khi kiem tra phan anh qua han:", err);
    }
}

/**
 * Dang ky job kiem tra dinh ky cac phan anh qua han 24h chua xu ly xong (xem
 * checkOverdueComplaintsAndNotify trong complaintService.ts). Cung hinh dang
 * voi startPcccDeadlineScheduler/startAppointmentScheduler o tren. Lich chay
 * cau hinh qua COMPLAINT_OVERDUE_CRON (mac dinh moi 30 phut - du gan de canh
 * bao khong tre qua lau sau khi vua qua nguong 24h).
 */
export function startComplaintOverdueScheduler(): void {
    if (global.__complaintOverdueSchedulerStarted) return;
    global.__complaintOverdueSchedulerStarted = true;

    const schedule = process.env.COMPLAINT_OVERDUE_CRON || "*/30 * * * *";
    cron.schedule(schedule, runComplaintOverdueCheck);
    console.log(`[complaint-overdue] Da dang ky lich kiem tra phan anh qua han: "${schedule}"`);

    setTimeout(runComplaintOverdueCheck, 5000);
}

async function runImportJobCleanup() {
    try {
        await connectDB();
        const result = await cleanupImportJobs();
        if (Object.values(result).some(count => count > 0)) {
            console.log(
                `[import-cleanup] Xoa ${result.abandonedDeleted} job bo do, danh dau ${result.staleMarkedFailed} job bi gian doan, don gon ${result.pruned} job da ket thuc, xoa ${result.expiredDeleted} job qua han luu`,
            );
        }
    } catch (err) {
        console.error("[import-cleanup] Loi khi don dep import job:", err);
    }
}

/**
 * Dang ky job don dep ImportJob dinh ky (xem importJobCleanupService.ts) -
 * cung hinh dang voi cac scheduler o tren. Lich chay cau hinh qua
 * IMPORT_JOB_CLEANUP_CRON (mac dinh moi 30 phut).
 */
export function startImportJobCleanupScheduler(): void {
    if (global.__importJobCleanupSchedulerStarted) return;
    global.__importJobCleanupSchedulerStarted = true;

    const schedule = process.env.IMPORT_JOB_CLEANUP_CRON || "*/30 * * * *";
    cron.schedule(schedule, runImportJobCleanup);
    console.log(`[import-cleanup] Da dang ky lich don dep import job: "${schedule}"`);

    setTimeout(runImportJobCleanup, 5000);
}
