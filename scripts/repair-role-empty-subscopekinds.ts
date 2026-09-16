/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Sua du lieu CU: Role.subScopeKinds bi luu nham thanh [] (mang rong) thay vi
 * undefined - xem models/Role.ts pre("validate") va rbac.areaScopeFilter.
 * Truoc khi co buoc chuan hoa trong Role.ts (them cung lan sua bug nay),
 * RoleListPage.tsx gui subScopeKinds cho MOI vai tro scopeType=NEIGHBORHOOD
 * (khong rieng Cong tac vien) - neu admin mo/luu lai vai tro To truong/Bi thu
 * qua man Quan ly vai tro (vd chi de doi ten/permission), truong nay bi luu
 * thanh [] thay vi khong co. rbac.areaScopeFilter coi [] la "vai tro hep pham
 * vi" (giong hasDenyOnlyRole) do [] la truthy trong JS, khien To truong/Bi thu
 * do mat het quyen xem House/Household (danh sach rong).
 *
 * Script nay CHI $unset subScopeKinds cho cac Role dang co gia tri [] - an
 * toan de chay lai nhieu lan (idempotent, lan sau se bao 0 ban ghi).
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Role } = await import("../src/models");

    await connectDB();

    const affected = await Role.find({ subScopeKinds: { $size: 0 } });
    if (affected.length === 0) {
        console.log("Khong co Role nao bi subScopeKinds: [] - khong can sua.");
        process.exit(0);
    }

    console.log(
        `Tim thay ${affected.length} vai tro bi subScopeKinds: []: ${affected
            .map(r => r.key)
            .join(", ")}`,
    );

    const result = await Role.updateMany(
        { subScopeKinds: { $size: 0 } },
        { $unset: { subScopeKinds: "" } },
    );

    console.log(`Da sua ${result.modifiedCount} vai tro.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
