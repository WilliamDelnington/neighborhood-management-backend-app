/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Backfill/repair truong pham vi (Role.scopeType/scopeMechanism/
 * maxActivePerScope/maxActiveScopesPerUser/subScopeKinds - xem models/Role.ts)
 * cho cac vai tro he thong, doc gia tri tu SYSTEM_ROLE_SCOPE_CONFIG. AN TOAN
 * de chay tren du lieu thuc (dev/production):
 * - Voi vai tro DA CO SAN: chi $set 5 truong pham vi noi tren, KHONG dong den
 *   permissions/allowedCreatableRoles/allowedComplaintCategories/
 *   allowedRequestTypes/sortOrder/... - khac scripts/backfill-roles.ts (script
 *   do truyen object khong co toan tu $ nao, MongoDB coi la THAY THE toan bo
 *   document tru _id, se xoa mat cac truong khong duoc liet ke o do neu chay
 *   lai - script nay CO CHU DICH tranh lap lai rui ro do bang cach chi $set).
 * - Voi 2 vai tro MOI (business_representative/company_representative - chua
 *   ton tai o bat ky database nao tung seed truoc khi 2 vai tro nay duoc them):
 *   tao moi day du (permissions + pham vi), vi khong co document san de $set.
 * - Khong dong den User/Household/Citizen/... hay bat ky Role nao khac ngoai
 *   danh sach key trong SYSTEM_ROLE_SCOPE_CONFIG.
 *
 * Dung khi mot database da co tu truoc luc them tinh nang pham vi dong (Config-
 * Driven Account Scope System) - cac Role da seed truoc do se khong tu co cac
 * truong pham vi nay (Mongoose chi ap dung default luc doc/hien thi mot
 * document, KHONG ap dung khi Mongo loc theo dieu kien truy van nhu
 * scopeMechanism:"ASSIGNED" - vi vay rbac.areaScopeFilter se khong tim thay
 * vai tro nao cho toi khi script nay duoc chay).
 *
 * Cac module cua app phai duoc import DONG (dynamic import) sau khi loadEnv()
 * chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Role, User } = await import("../src/models");
    const { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLE_SCOPE_CONFIG } = await import(
        "../src/lib/systemRoles"
    );
    const { ROLE_LABEL } = await import("../src/types");

    await connectDB();

    const admin = await User.findOne({ roles: "admin" }).sort({ createdAt: 1 });
    const actorId = admin ? String(admin._id) : undefined;

    let updatedCount = 0;
    let createdCount = 0;

    for (const [key, scopeConfig] of Object.entries(SYSTEM_ROLE_SCOPE_CONFIG)) {
        // eslint-disable-next-line no-await-in-loop
        const existing = await Role.findOne({ key });
        if (existing) {
            // eslint-disable-next-line no-await-in-loop
            await Role.updateOne(
                { key },
                {
                    $set: {
                        ...scopeConfig,
                        ...(actorId ? { updatedBy: actorId } : {}),
                    },
                },
            );
            console.log(
                `Da cap nhat pham vi cho vai tro da co "${key}": ${JSON.stringify(scopeConfig)}`,
            );
            updatedCount += 1;
        } else {
            // eslint-disable-next-line no-await-in-loop
            await Role.create({
                key,
                name: ROLE_LABEL[key] || key,
                permissions: SYSTEM_ROLE_PERMISSIONS[key] || [],
                ...scopeConfig,
                system: true,
                active: true,
                sortOrder: 999,
                ...(actorId ? { createdBy: actorId, updatedBy: actorId } : {}),
            });
            console.log(
                `Da tao moi vai tro he thong "${key}" (chua ton tai truoc do trong database nay)`,
            );
            createdCount += 1;
        }
    }

    console.log(
        `\nHoan tat. Cap nhat pham vi cho ${updatedCount} vai tro da co, tao moi ${createdCount} vai tro. ` +
            "Khong dong den permissions/allowedCreatableRoles/... cua bat ky vai tro da co san nao, " +
            "va khong dong den User/Household/Citizen/... nao ca.",
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
