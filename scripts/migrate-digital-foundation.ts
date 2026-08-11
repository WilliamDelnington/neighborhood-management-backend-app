import { config as loadEnv } from "dotenv";

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Citizen, HouseRecord, RequestTypeDefinition, Role, User } =
        await import("@/models");
    await connectDB();

    const [users, citizens, houses] = await Promise.all([
        User.updateMany(
            { identityVerificationStatus: { $exists: false } },
            {
                $set: {
                    identityProvider: "phone_temporary",
                    identityVerificationStatus: "unverified",
                },
            },
        ),
        Citizen.updateMany(
            { identityVerificationStatus: { $exists: false } },
            {
                $set: {
                    identityProvider: "manual_declaration",
                    identityVerificationStatus: "unverified",
                },
            },
        ),
        HouseRecord.updateMany(
            {
                $or: [
                    { gisLatitude: { $exists: false } },
                    { gisLongitude: { $exists: false } },
                    { gisLatitude: 0 },
                    { gisLongitude: 0 },
                ],
            },
            {
                $set: {
                    gisLatitude: null,
                    gisLongitude: null,
                    gisAccuracyMeters: null,
                    gisSource: "unavailable",
                    gisCapturedAt: null,
                },
                $unset: { location: "" },
            },
        ),
    ]);

    const rolePermissions: Record<string, string[]> = {
        admin: [
            "houses.update_gis",
            "request_types.read",
            "request_types.manage",
        ],
        neighborhood_leader: ["houses.update_gis", "request_types.read"],
        secretary: [
            "houses.update_gis",
            "request_types.read",
            "request_types.manage",
        ],
        regional_police: ["houses.update_gis", "request_types.read"],
        people_committee_official: [
            "houses.update_gis",
            "requests.create",
            "request_types.read",
            "request_types.manage",
        ],
        house_owner: ["houses.update_gis"],
    };
    for (const [key, permissions] of Object.entries(rolePermissions)) {
        // Chi them quyen moi, khong ghi de cac tuy chinh vai tro hien co.
        await Role.updateOne(
            { key },
            { $addToSet: { permissions: { $each: permissions } } },
        );
    }
    await Promise.all([
        HouseRecord.createIndexes(),
        RequestTypeDefinition.createIndexes(),
    ]);

    console.log(
        JSON.stringify(
            {
                usersBackfilled: users.modifiedCount,
                citizensBackfilled: citizens.modifiedCount,
                housesNormalized: houses.modifiedCount,
                rolesUpdated: Object.keys(rolePermissions),
            },
            null,
            2,
        ),
    );
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
