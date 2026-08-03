export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { validateAuthConfig, validateZaloWebhookConfig } = await import(
            "@/lib/config"
        );
        validateAuthConfig();
        validateZaloWebhookConfig();

        const { startPcccDeadlineScheduler } = await import("@/lib/scheduler");
        startPcccDeadlineScheduler();
    }
}
