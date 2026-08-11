/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Role } = await import("@/models");
    await connectDB();

    const roles = [
        {
            key: "secretary",
            name: "Bí thư Đảng ủy Phường/xã",
            permissions: [
                "inspections.read",
                "inspections.create",
                "inspections.manage",
            ],
        },
        {
            key: "people_committee_official",
            name: "Cán bộ UBND Phường/xã",
            permissions: [
                "inspections.read",
                "inspections.create",
                "inspections.manage",
            ],
        },
        {
            key: "neighborhood_coleader",
            name: "Tổ phó",
            permissions: [
                "inspections.read",
                "inspections.execute",
                "inspections.assign",
                "inspections.verify",
                "inspections.submit_to_ward",
            ],
        },
        {
            key: "neighborhood_collaborator",
            name: "Cộng tác viên Tổ dân phố",
            permissions: [
                "inspections.read",
                "inspections.execute",
                "notifications.read",
            ],
        },
    ];

    for (const role of roles) {
        const updated = await Role.findOneAndUpdate(
            { key: role.key },
            {
                $set: {
                    name: role.name,
                    active: true,
                },
                $setOnInsert: {
                    key: role.key,
                    system: false,
                    sortOrder: 60,
                },
                $addToSet: { permissions: { $each: role.permissions } },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        console.log(`Đã bảo đảm vai trò "${updated.name}" có quyền B07 cần thiết.`);
    }

    console.log("Hoàn tất. Các quyền khác đang có trên vai trò được giữ nguyên.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
