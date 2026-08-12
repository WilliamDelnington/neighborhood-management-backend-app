import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { sendEsmsSms } from "@/lib/esms";

async function main() {
    const phone = process.argv[2];
    if (!phone) {
        console.error("Dung: npx tsx scripts/test-esms.ts 0912345678");
        process.exit(1);
    }
    const result = await sendEsmsSms(
        phone,
        "Ma xac thuc cua ban la: 123456. Day la SMS test tich hop eSMS.",
    );
    console.log("Ket qua:", result);
}

main();
