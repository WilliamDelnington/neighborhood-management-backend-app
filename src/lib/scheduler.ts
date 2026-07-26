import cron from "node-cron";
import { connectDB } from "@/lib/mongodb";
import { checkPcccDeadlinesAndNotify } from "@/services/pcccService";

// next dev co the goi register() (xem src/instrumentation.ts) nhieu lan khi
// module server duoc bien dich lai - dung cờ toan cuc de dam bao job cron chi
// duoc dang ky mot lan cho moi process.
declare global {
    // eslint-disable-next-line no-var
    var __pcccDeadlineSchedulerStarted: boolean | undefined;
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
