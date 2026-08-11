import { config as loadEnv } from "dotenv";

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Neighborhood, Role } = await import("@/models");
    await connectDB();

    await Neighborhood.updateMany(
        { status: { $exists: false }, active: { $ne: false } },
        { $set: { status: "ACTIVE" } },
    );
    await Neighborhood.updateMany(
        { status: { $exists: false }, active: false },
        { $set: { status: "INACTIVE" } },
    );
    await Neighborhood.updateMany(
        { streetIds: { $exists: false } },
        { $set: { streetIds: [] } },
    );
    await Neighborhood.updateMany(
        { alleyDescriptions: { $exists: false } },
        { $set: { alleyDescriptions: [] } },
    );
    await Neighborhood.updateMany(
        { boundaryType: { $exists: false } },
        { $set: { boundaryType: "NONE" } },
    );

    const indexes = await Neighborhood.collection.indexes();
    const oldCodeIndex = indexes.find(
        index => index.name === "code_1" && index.unique,
    );
    if (oldCodeIndex) {
        await Neighborhood.collection.dropIndex("code_1");
    }
    await Neighborhood.syncIndexes();

    // Chi them cac quyen con thieu, khong ghi de cau hinh permission ma admin
    // da tuy chinh tren Role he thong.
    await Role.updateMany(
        { key: { $in: ["secretary", "people_committee_official"] } },
        {
            $addToSet: {
                permissions: {
                    $each: [
                        "neighborhoods.read",
                        "neighborhoods.manage",
                        "streets.read",
                    ],
                },
            },
        },
    );

    console.log("Da backfill To dan pho, doi unique code theo Phuong/Xa va bo sung quyen quan ly cho vai tro Phuong.");
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
