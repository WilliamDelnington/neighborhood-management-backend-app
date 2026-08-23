import cron from "node-cron";
import { connectDB } from "@/lib/mongodb";
import { checkPcccDeadlinesAndNotify } from "@/services/pcccService";
import { checkAppointmentRemindersAndNoShow } from "@/services/appointmentService";

// next dev co the goi register() (xem src/instrumentation.ts) nhieu lan khi
// module server duoc bien dich lai - dung cờ toan cuc de dam bao job cron chi
// duoc dang ky mot lan cho moi process.
declare global {
    // eslint-disable-next-line no-var
    var __pcccDeadlineSchedulerStarted: boolean | undefined;
    // eslint-disable-next-line no-var
    var __appointmentSchedulerStarted: boolean | undefined;
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
