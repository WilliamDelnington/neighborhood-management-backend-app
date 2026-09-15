/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Chi doc (khong sua gi) - in ra dung 2 nguyen nhan co the khien "Loại yêu
 * cầu" trong form "Gửi yêu cầu" rong cho neighborhood_leader/neighborhood_coleader,
 * du da chay request-types:backfill-sender-roles:
 *   1. RequestTypeDefinition.allowedSenderRoles cua 4 loai built-in co thuc
 *      su chua "neighborhood_leader"/"neighborhood_coleader" hay khong.
 *   2. Role.allowedRequestTypes cua chinh 2 vai tro do co dang bi gioi han
 *      con [] (rong) hoac mot danh sach khac khong khop key built-in hay
 *      khong - day la TRUC THU HAI, doc lap voi (1), cung co the lam
 *      getRequestMeta tra ve rong (xem getUserAllowedRequestTypes trong
 *      rbac.ts: [] o day nghia la "khong duoc gui loai nao ca", KHAC voi
 *      undefined = khong gioi han).
 *
 * Chay: npm run diagnose:request-type-picker
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { RequestTypeDefinition, Role } = await import("../src/models");

    await connectDB();

    console.log("=== 1. RequestTypeDefinition.allowedSenderRoles (built-in) ===");
    const types = await RequestTypeDefinition.find({ isBuiltIn: true }).select(
        "key allowedSenderRoles allowedReceiverRoles active",
    );
    for (const t of types) {
        const hasLeader = (t.allowedSenderRoles || []).includes("neighborhood_leader");
        const hasColeader = (t.allowedSenderRoles || []).includes(
            "neighborhood_coleader",
        );
        console.log(
            `  "${t.key}" (active=${t.active}): allowedSenderRoles=${JSON.stringify(
                t.allowedSenderRoles,
            )} -> neighborhood_leader=${hasLeader}, neighborhood_coleader=${hasColeader}`,
        );
    }

    console.log("\n=== 2. Role.allowedRequestTypes (neighborhood_leader/coleader) ===");
    const roles = await Role.find({
        key: { $in: ["neighborhood_leader", "neighborhood_coleader"] },
    }).select("key active allowedRequestTypes");
    for (const r of roles) {
        const raw = (r as unknown as { allowedRequestTypes?: string[] })
            .allowedRequestTypes;
        const verdict =
            raw === undefined
                ? "undefined -> KHONG gioi han (OK)"
                : raw.length === 0
                  ? "[] RONG -> KHONG duoc gui loai nao ca (DAY LA LOI neu khong co chu dich)"
                  : `co gioi han: ${JSON.stringify(raw)}`;
        console.log(`  "${r.key}" (active=${r.active}): ${verdict}`);
    }

    console.log("\nHoan tat.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
