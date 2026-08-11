/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Tao ban ghi OrganizationRepresentative (role="legal_representative",
 * verificationStatus="verified") cho moi Organization da co
 * representativeUserId nhung CHUA co ban ghi OrganizationRepresentative
 * tuong ung - ap dung MOT LAN sau khi chuyen nguon su that tu mot field don
 * (Organization.representativeUserId) sang bang lich su rieng (xem
 * organizationRepresentativeService.ts). Dat "verified" thay vi
 * "waiting_verification" mac dinh cua ban ghi moi: cac nguoi dai dien nay da
 * hoat dong binh thuong truoc khi co tinh nang nay, nen coi la khong can xac
 * thuc lai thay vi vo tinh khoa ho lai tu dau.
 *
 * An toan de chay lai nhieu lan (idempotent) - chi xu ly Organization CHUA co
 * ban ghi OrganizationRepresentative (role="legal_representative") dang
 * active nao.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { Organization, OrganizationRepresentative } = await import(
        "../src/models"
    );

    await connectDB();

    const organizations = await Organization.find({
        representativeUserId: { $exists: true, $ne: null },
    }).select("_id representativeUserId representativeRole");
    console.log(
        `To chuc co representativeUserId can kiem tra: ${organizations.length}`,
    );

    let created = 0;
    for (const organization of organizations) {
        // eslint-disable-next-line no-await-in-loop
        const existing = await OrganizationRepresentative.findOne({
            organizationId: organization._id,
            active: true,
            role: "legal_representative",
        });
        if (existing) continue;

        // eslint-disable-next-line no-await-in-loop
        await OrganizationRepresentative.create({
            organizationId: organization._id,
            userId: organization.representativeUserId,
            role: "legal_representative",
            title: organization.representativeRole,
            verificationStatus: "verified",
        });
        created += 1;
    }

    console.log(
        `\nHoan tat. Da tao ${created}/${organizations.length} ban ghi OrganizationRepresentative.`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
