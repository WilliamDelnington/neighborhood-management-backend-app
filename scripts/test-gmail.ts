import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { sendGmailEmail } from "@/lib/integrations/gmail";

async function main() {
    const to = process.argv[2];
    if (!to) {
        console.error("Dung: npx tsx scripts/test-gmail.ts ten@example.com");
        process.exit(1);
    }
    const result = await sendGmailEmail({
        to,
        subject: "Email test tích hợp Gmail SMTP",
        html: "<p>Đây là email test tích hợp Gmail SMTP.</p>",
        text: "Đây là email test tích hợp Gmail SMTP.",
    });
    console.log("Kết quả:", result);
}

main();
