/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Truoc day SecurityRecord.handlingStatus la text tu do; nay da doi sang enum
 * co dinh (chua_xu_ly / dang_xu_ly / da_xu_ly) de thong ke ro rang hon (xem
 * models/SecurityRecord.ts va validators/security.ts). Doi schema khong tu
 * dong sua du lieu da luu - cac ban ghi cu co the dang trong (chua tung nhap)
 * hoac chua text tu do khong khop enum, khien SecurityRecord.aggregate group
 * theo handlingStatus bo qua cac ban ghi nay va lam thong ke bi thieu.
 * An toan de chay nhieu lan (idempotent) - chi xu ly cac ban ghi chua co gia
 * tri hop le trong enum moi. Doan van ban tu do duoc doan (best-effort) theo
 * tu khoa; ket qua doan luon duoc log ra de kiem tra thu cong.
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua models/index.ts -> Citizen model) phai duoc import DONG
 * (dynamic import) sau khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts
 * de biet ly do (TypeScript/CJS hoist import tinh len dau file bat ke vi tri
 * trong source, khien bien moi truong chua kip nap khi module duoc require()).
 */

const VALID_STATUSES = new Set(["chua_xu_ly", "dang_xu_ly", "da_xu_ly"]);

function guessStatus(rawText: unknown): "chua_xu_ly" | "dang_xu_ly" | "da_xu_ly" {
    const text = String(rawText || "").toLowerCase();
    if (!text.trim()) return "chua_xu_ly";
    if (/da\s*xu\s*ly|hoan\s*tat|xong|đã xử lý|hoàn tất/.test(text))
        return "da_xu_ly";
    if (/dang\s*xu\s*ly|theo\s*doi|đang xử lý|theo dõi/.test(text))
        return "dang_xu_ly";
    return "chua_xu_ly";
}

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { SecurityRecord } = await import("../src/models");

    await connectDB();

    const legacyDocs = await SecurityRecord.collection
        .find({ handlingStatus: { $nin: Array.from(VALID_STATUSES) } })
        .toArray();
    console.log(
        `Tim thay ${legacyDocs.length} ho so an ninh con dung handlingStatus cu (text tu do hoac trong).`,
    );

    for (const doc of legacyDocs) {
        const oldValue = doc.handlingStatus;
        const guessed = guessStatus(oldValue);

        // eslint-disable-next-line no-await-in-loop
        await SecurityRecord.collection.updateOne(
            { _id: doc._id },
            { $set: { handlingStatus: guessed } },
        );
        console.log(
            `Ho so ${doc._id}: "${oldValue ?? ""}" -> ${guessed} (can kiem tra lai neu doan sai).`,
        );
    }

    console.log(`\nHoan tat. Da cap nhat ${legacyDocs.length} ho so.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
