/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Sua du lieu CU: cac ComplaintTypeDefinition da ton tai TRUOC khi co truong
 * allowedSenderRoles (xem models/ComplaintTypeDefinition.ts) deu co gia tri
 * mac dinh [] (mang rong) - va [] nghia la KHONG AI duoc gui (cung quy uoc
 * voi RequestTypeDefinition.allowedSenderRoles, xem createComplaint o
 * complaintService.ts). Neu khong chay script nay NGAY khi trien khai truong
 * moi, MOI danh muc phan anh hien co se tu choi TOAN BO nguoi gui hien tai
 * (cu dan) ngay lap tuc.
 *
 * Dat allowedSenderRoles = 4 vai tro cu dan (house_owner/household_head/
 * business_representative/company_representative) cho MOI danh muc dang co
 * allowedSenderRoles rong/thieu - day CHINH XAC la tap vai tro dang giu quyen
 * "complaints.create" truoc khi tinh nang To truong/To pho gui len Phuong
 * duoc them (xem systemRoles.ts) - hardcode thay vi tinh dong tu
 * getRoleKeysWithPermission de khong bi anh huong boi viec them
 * complaints.create cho neighborhood_leader/neighborhood_coleader cung dot
 * trien khai nay.
 *
 * KHONG dong den danh muc da co allowedSenderRoles khac rong (vd danh muc
 * "to_de_xuat_len_phuong" da duoc seed voi gia tri rieng, hoac danh muc admin
 * da tuy chinh sau khi truong nay ra mat) - an toan de chay lai nhieu lan.
 *
 * Chay: npm run complaint-types:backfill-sender-roles
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { ComplaintTypeDefinition } = await import("../src/models");

    await connectDB();

    const CITIZEN_SENDER_ROLES = [
        "house_owner",
        "household_head",
        "business_representative",
        "company_representative",
    ];

    const affected = await ComplaintTypeDefinition.find({
        $or: [
            { allowedSenderRoles: { $exists: false } },
            { allowedSenderRoles: { $size: 0 } },
        ],
    });

    if (affected.length === 0) {
        console.log("Khong co danh muc phan anh nao can sua - da day du allowedSenderRoles.");
        process.exit(0);
    }

    console.log(
        `Tim thay ${affected.length} danh muc phan anh thieu allowedSenderRoles: ${affected
            .map(d => d.key)
            .join(", ")}`,
    );

    const result = await ComplaintTypeDefinition.updateMany(
        {
            $or: [
                { allowedSenderRoles: { $exists: false } },
                { allowedSenderRoles: { $size: 0 } },
            ],
        },
        { $set: { allowedSenderRoles: CITIZEN_SENDER_ROLES } },
    );

    console.log(`Da sua ${result.modifiedCount} danh muc.`);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
