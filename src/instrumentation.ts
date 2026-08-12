export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const {
            validateAuthConfig,
            validateZaloWebhookConfig,
            validatePublicOriginConfig,
        } = await import("@/lib/config");
        validateAuthConfig();
        validateZaloWebhookConfig();
        validatePublicOriginConfig();

        const { startPcccDeadlineScheduler } = await import("@/lib/scheduler");
        startPcccDeadlineScheduler();
    }
}
