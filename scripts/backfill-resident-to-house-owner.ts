/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Vai tro "resident" da doi ten thanh "house_owner" (cung permission, chi doi
 * key) - xem src/lib/systemRoles.ts. Doi ten trong code khong tu dong sua du
 * lieu da luu trong DB: cac User/RoleAssignment cu van con gia tri "resident",
 * va Role collection van con doc cu voi key "resident" (thay vi duoc rename
 * tai cho, upsert-by-key trong scripts/backfill-roles.ts se tao THEM mot doc
 * "house_owner" moi ben canh, khong xoa/doi ten doc "resident" cu).
 * Luu y: neu mot User da dang nhap voi roles:["house_owner"] TRUOC khi script
 * nay chay, rbac.ts (ensurePlaceholderRole) co the da tu tao san mot Role doc
 * "house_owner" placeholder (active:false, permissions:[]) - nen khong the
 * doi ten tai cho doc "resident" thanh "house_owner" (se dung key). Vi vay
 * script nay upsert doc "house_owner" (ghi de placeholder neu co) roi xoa
 * doc "resident" cu, thay vi rename tai cho.
 * An toan de chay nhieu lan (idempotent) - chi cham vao ban ghi con gia tri
 * "resident".
 *
 * Cac module cua app (dac biet la @/lib/encryption, doc ENCRYPTION_KEY ngay
 * luc import qua models/index.ts -> Citizen model) phai duoc import DONG
 * (dynamic import) sau khi loadEnv() chay - xem scripts/backfill-encrypt-citizens.ts
 * de biet ly do.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Role, User, RoleAssignment } = await import("../src/models");
    const { SYSTEM_ROLE_PERMISSIONS } = await import("../src/lib/systemRoles");

    await connectDB();

    await Role.findOneAndUpdate(
        { key: "house_owner" },
        {
            key: "house_owner",
            name: "Chủ hộ",
            permissions: SYSTEM_ROLE_PERMISSIONS.house_owner,
            system: true,
            active: true,
        },
        { upsert: true, setDefaultsOnInsert: true },
    );
    console.log('Đã đảm bảo Role "house_owner" tồn tại và đúng quyền');

    const deleted = await Role.deleteOne({ key: "resident" });
    if (deleted.deletedCount > 0) {
        console.log('Đã xóa Role "resident" cũ');
    } else {
        console.log('Không tìm thấy Role "resident" (có thể đã migrate trước đó)');
    }

    const usersWithRole = await User.updateMany(
        { roles: "resident" },
        { $set: { "roles.$[elem]": "house_owner" } },
        { arrayFilters: [{ elem: "resident" }] },
    );
    const usersWithPrimaryRole = await User.updateMany(
        { primaryRole: "resident" },
        { $set: { primaryRole: "house_owner" } },
    );
    console.log(
        `Đã cập nhật ${usersWithRole.modifiedCount} User.roles và ${usersWithPrimaryRole.modifiedCount} User.primaryRole từ "resident" -> "house_owner"`,
    );

    const assignments = await RoleAssignment.updateMany(
        { role: "resident" },
        { $set: { role: "house_owner" } },
    );
    console.log(
        `Đã cập nhật ${assignments.modifiedCount} RoleAssignment từ "resident" -> "house_owner"`,
    );

    console.log("\nHoàn tất migrate resident -> house_owner.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
