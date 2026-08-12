import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { sendEsmsZns } from "@/lib/esmsZns";

async function main() {
    const phone = process.argv[2];
    if (!phone) {
        console.error("Dung: npx tsx scripts/test-esms-zns.ts 0912345678");
        process.exit(1);
    }
    const result = await sendEsmsZns(phone, "123456");
    console.log("Ket qua:", result);
}

main();
