/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { connectDB } from "@/lib/mongodb";
import { Role, User } from "../src/models";
import { SYSTEM_ROLE_PERMISSIONS } from "../src/lib/systemRoles";
import { ROLE_LABEL } from "../src/types";

/**
 * Backfill/repair 6 vai tro he thong voi ten + permission dung, KHONG dong den
 * User/Household/Citizen/... - an toan de chay tren du lieu thuc (khac voi
 * scripts/seed.ts, vi seed.ts xoa toan bo du lieu demo truoc khi tao lai).
 * Dung khi mot DB da co tu truoc luc them tinh nang vai tro dong, nen Role
 * collection dang trong hoac chi co cac placeholder inactive (permissions=[])
 * duoc tu dong tao boi rbac.ts khi gap role key chua co Role tuong ung.
 */
async function main() {
    await connectDB();

    let admin = await User.findOne({ roles: "admin" }).sort({ createdAt: 1 });
    const actorId = admin ? String(admin._id) : undefined;

    for (const [key, permissions] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
        const result = await Role.findOneAndUpdate(
            { key },
            {
                key,
                name: ROLE_LABEL[key] || key,
                permissions,
                system: true,
                active: true,
                ...(actorId ? { updatedBy: actorId } : {}),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        console.log(
            `Đã cập nhật vai trò "${result.key}" (${result.permissions.length} quyền)`,
        );
    }

    console.log("\nHoàn tất. Không có dữ liệu User/Household/... nào bị thay đổi.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
