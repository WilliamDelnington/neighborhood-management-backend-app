/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Cau hinh dinh tuyen "kieu cu": mot so danh muc phan anh (Complaint) co doi
 * ngu chuyen mon rieng thay vi mac dinh chi To truong/To pho (xem
 * DEFAULT_RECEIVER_ROLES trong scripts/seed-complaint-types.ts). Script nay:
 *
 * 1. Tao (hoac cap nhat neu da co) vai tro he thong "environment_officer" (Can
 *    bo moi truong) - permissions/scope lay tu SYSTEM_ROLE_PERMISSIONS/
 *    SYSTEM_ROLE_SCOPE_CONFIG (src/lib/systemRoles.ts), giong cach
 *    scripts/backfill-role-scope-config.ts tao vai tro he thong con thieu.
 * 2. Dat ComplaintTypeDefinition.allowedReceiverRoles (truong QUYET DINH ai
 *    duoc thong bao/dinh tuyen khi phan anh moi duoc tao - xem
 *    resolveComplaintTypeRecipientIds trong complaintService.ts):
 *      - an_ninh_trat_tu, pccc -> ["regional_police"]
 *      - ve_sinh_moi_truong    -> ["environment_officer"]
 *    Cac danh muc con lai GIU NGUYEN mac dinh (neighborhood_leader/coleader) -
 *    khong co doi ngu chuyen mon tuong ung trong he thong hien tai.
 *
 * LUU Y: To truong/To pho cua to dan pho nguoi gui VAN LUON duoc thong bao
 * cung (xem createComplaint - dong "Bao gio cung bao To truong/To pho...") -
 * day la hanh vi co chu dich cua he thong, KHONG bi thay doi boi script nay.
 * Police/Can bo moi truong duoc THEM VAO, khong THAY THE, luong thong bao nay.
 *
 * An toan de chay lai nhieu lan (idempotent). CHUA gan vai tro
 * "environment_officer" cho bat ky tai khoan nao - dung man "Gán vai trò mới"
 * (admin app) de gan vao (cac) tai khoan can bo moi truong thuc te, giong cach
 * gan regional_police/secretary hien tai.
 *
 * Chay: npx tsx scripts/seed-complaint-category-routing.ts
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Role, User, ComplaintTypeDefinition } = await import(
        "../src/models"
    );
    const { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLE_SCOPE_CONFIG } = await import(
        "../src/lib/systemRoles"
    );
    const { ROLE_LABEL } = await import("../src/types");

    await connectDB();

    const admin = await User.findOne({ roles: "admin" }).sort({ createdAt: 1 });
    if (!admin) {
        throw new Error(
            "Khong tim thay tai khoan admin nao (can it nhat 1 admin de ghi createdBy/updatedBy)",
        );
    }
    const actorId = String(admin._id);

    // Buoc 1: dam bao vai tro "environment_officer" ton tai.
    const ENV_ROLE_KEY = "environment_officer";
    let envRole = await Role.findOne({ key: ENV_ROLE_KEY });
    if (!envRole) {
        envRole = await Role.create({
            key: ENV_ROLE_KEY,
            name: ROLE_LABEL[ENV_ROLE_KEY],
            permissions: SYSTEM_ROLE_PERMISSIONS[ENV_ROLE_KEY],
            ...SYSTEM_ROLE_SCOPE_CONFIG[ENV_ROLE_KEY],
            system: true,
            active: true,
            sortOrder: 999,
            createdBy: actorId,
            updatedBy: actorId,
        });
        console.log(`Da tao vai tro moi "${ENV_ROLE_KEY}" (${envRole.name}).`);
    } else {
        console.log(`Vai tro "${ENV_ROLE_KEY}" da ton tai, giu nguyen permissions/scope hien co.`);
    }

    // Buoc 2: allowedReceiverRoles - truong quyet dinh dinh tuyen/thong bao.
    const receiverRoleUpdates: Array<{ key: string; roles: string[] }> = [
        { key: "an_ninh_trat_tu", roles: ["regional_police"] },
        { key: "pccc", roles: ["regional_police"] },
        { key: "ve_sinh_moi_truong", roles: [ENV_ROLE_KEY] },
    ];
    for (const { key, roles } of receiverRoleUpdates) {
        // eslint-disable-next-line no-await-in-loop
        const result = await ComplaintTypeDefinition.updateOne(
            { key },
            { $set: { allowedReceiverRoles: roles, updatedBy: actorId } },
        );
        if (result.matchedCount === 0) {
            console.warn(
                `CANH BAO: khong tim thay ComplaintTypeDefinition voi key "${key}" ` +
                    "- chay scripts/seed-complaint-types.ts truoc de tao danh muc nay.",
            );
        } else {
            console.log(
                `Da dat allowedReceiverRoles cho danh muc "${key}": [${roles.join(", ")}]`,
            );
        }
    }

    console.log(
        "\nHoan tat. Con thieu: gan vai tro \"environment_officer\" (va kiem tra " +
            "regional_police da duoc gan) cho cac tai khoan can bo thuc te qua man " +
            '"Gán vai trò mới" (admin app), neu chua co ai giu vai tro nay thi se ' +
            "khong co nguoi nhan thong bao du danh muc da duoc dinh tuyen dung.",
    );

    await import("mongoose").then(m => m.default.connection.close());
    process.exit(0);
}

main().catch(err => {
    console.error("Cau hinh dinh tuyen phan anh that bai:", err);
    process.exit(1);
});
