/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Organization.taxCode vua doi tu required+unique sang optional+unique+sparse
 * (to chuc khong bat buoc phai co ma so thue - xem models/Organization.ts).
 * Index unique CU (khong sparse) da ton tai san trong MongoDB tu truoc van
 * con hieu luc cho toi khi duoc xoa thu cong - Mongoose autoIndex KHONG tu
 * xoa/doi index xung dot, chi tao them index con thieu. Neu khong chay script
 * nay, tao ban ghi to chuc thu hai khong co taxCode se bi MongoDB tu choi vi
 * vi pham index cu.
 * An toan de chay nhieu lan (idempotent) - bo qua neu index cu da duoc xoa.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Organization } = await import("../src/models");

    await connectDB();

    const indexes = await Organization.collection.indexes();
    const staleIndex = indexes.find(
        idx =>
            idx.key &&
            Object.keys(idx.key).length === 1 &&
            idx.key.taxCode === 1 &&
            idx.unique &&
            !idx.sparse,
    );

    if (!staleIndex) {
        console.log(
            "Khong tim thay index unique (khong sparse) cu tren taxCode - khong can lam gi them.",
        );
    } else {
        await Organization.collection.dropIndex(staleIndex.name as string);
        console.log(`Da xoa index cu "${staleIndex.name}".`);
    }

    await Organization.syncIndexes();
    console.log("Da dong bo lai index cho Organization (unique + sparse).");

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
