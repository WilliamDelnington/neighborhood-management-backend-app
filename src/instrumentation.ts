export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { startPcccDeadlineScheduler } = await import("@/lib/scheduler");
        startPcccDeadlineScheduler();
    }
}
