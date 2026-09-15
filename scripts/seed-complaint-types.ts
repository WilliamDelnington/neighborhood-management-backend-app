/* eslint-disable no-console */
/**
 * Tao (idempotent, khong pha huy) mot ComplaintTypeDefinition cho MOI gia tri
 * cua NHOM_PHAN_ANH (danh sach nhom phan anh cu, hardcode trong @/types) -
 * chuan bi chuyen Complaint.category tu enum tinh sang danh muc quan tri duoc
 * (xem complaintTypeDefinitionService.ts). Moi danh muc duoc seed voi
 * isBuiltIn:true, allowedReceiverRoles mac dinh la
 * ["neighborhood_leader", "neighborhood_coleader"] - dung HANH VI DIEU HUONG
 * HIEN TAI cua createComplaint (giao To truong/To pho cua to dan pho chua nha
 * so duoc chon, xem createComplaint truoc khi co ComplaintTypeDefinition) -
 * va allowedSenderRoles mac dinh la 4 vai tro cu dan (CITIZEN_SENDER_ROLES).
 *
 * Cung tao (hoac cap nhat isBuiltIn neu da ton tai) MOT danh muc rieng
 * "to_de_xuat_len_phuong" - KHONG thuoc NHOM_PHAN_ANH (danh muc do la cho cu
 * dan) - cho phep To truong/To pho gui de xuat/phan anh len Bi thu/Can bo
 * UBND cap Phuong.
 *
 * An toan de chay lai nhieu lan:
 *   - Moi danh muc duoc dinh danh boi `key` (unique); da ton tai thi KHONG ghi
 *     de name/description/allowedReceiverRoles/active - cac truong nay chi
 *     duoc dat luc TAO MOI ($setOnInsert), tranh xoa mat tuy chinh cua admin
 *     qua man quan ly (ComplaintTypeListPage).
 *   - isBuiltIn luon duoc dam bao la true cho cac key nay (khoa key/xoa o
 *     tang service), ke ca khi chay lai sau khi da ton tai.
 *
 * Chay: npm run seed:complaint-types   (hoac: tsx scripts/seed-complaint-types.ts)
 *
 * LUU Y DNS / IMPORT MODELS: xem giai thich chi tiet trong
 * scripts/seed-neighborhoods.ts - phai loadEnv()/dns.setServers() TRUOC, va chi
 * import cac module dong den @/lib/encryption (qua models barrel) bang dynamic
 * import() SAU khi loadEnv() da chay.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import dns from "dns";

const dnsServers = (process.env.MONGODB_DNS_SERVERS || "1.1.1.1,8.8.8.8")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
if (dnsServers.length) {
    dns.setServers(dnsServers);
}

import mongoose from "mongoose";

// Vai tro nhan mac dinh cho MOI danh muc seed - phan anh dung hanh vi dieu
// huong hien tai (To truong/To pho cua to dan pho chua nha so duoc chon,
// hoac cap Phuong khi khong xac dinh duoc to dan pho) truoc khi co danh muc
// quan tri duoc. Xem resolveComplaintTypeRecipientIds trong complaintService.ts.
const DEFAULT_RECEIVER_ROLES = ["neighborhood_leader", "neighborhood_coleader"];
// Vai tro nguoi gui mac dinh cho cac danh muc NHOM_PHAN_ANH (danh cho cu dan) -
// dung 4 vai tro dang giu quyen "complaints.create" TRUOC khi co danh muc
// rieng cho To truong/To pho gui len Phuong (xem key
// "to_de_xuat_len_phuong" ben duoi) - giu dung hanh vi hien tai (chi cu dan
// gui duoc cac danh muc nay). Neu database da co san cac danh muc nay tu
// truoc khi co truong allowedSenderRoles, chay
// scripts/backfill-complaint-type-sender-roles.ts thay vi script nay (script
// nay chi dat gia tri LUC TAO MOI, khong ghi de ban ghi da co).
const CITIZEN_SENDER_ROLES = [
    "house_owner",
    "household_head",
    "business_representative",
    "company_representative",
];

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error("Thieu bien moi truong MONGODB_URI (kiem tra .env.local)");
    }

    console.log("Dang ket noi MongoDB...");
    await mongoose.connect(uri, { bufferCommands: false });

    const { User, ComplaintTypeDefinition } = await import("../src/models");
    const { NHOM_PHAN_ANH, NHOM_PHAN_ANH_LABEL } = await import("../src/types");

    const admin = await User.findOne({ roles: "admin" }).sort({ createdAt: 1 });
    if (!admin) {
        throw new Error(
            "Khong tim thay tai khoan admin nao - can it nhat 1 admin de ghi createdBy/updatedBy (chay npm run seed truoc)",
        );
    }
    const actorId = admin._id;

    let createdCount = 0;
    let alreadyExistedCount = 0;

    for (const key of NHOM_PHAN_ANH) {
        // eslint-disable-next-line no-await-in-loop
        const existing = await ComplaintTypeDefinition.findOne({ key }).select("_id");
        if (existing) {
            // isBuiltIn phai luon la true cho cac key nay du ban ghi da ton
            // tai truoc do (vd tao thu cong truoc khi co script nay) - day la
            // truong duy nhat duoc phep ghi de tren ban ghi da co. Khong dong
            // den name/description/allowedReceiverRoles/active - tranh xoa
            // mat tuy chinh cua admin qua man quan ly.
            // eslint-disable-next-line no-await-in-loop
            await ComplaintTypeDefinition.updateOne(
                { _id: existing._id },
                { $set: { isBuiltIn: true } },
            );
            alreadyExistedCount += 1;
            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        await ComplaintTypeDefinition.create({
            key,
            name: NHOM_PHAN_ANH_LABEL[key],
            allowedReceiverRoles: DEFAULT_RECEIVER_ROLES,
            allowedSenderRoles: CITIZEN_SENDER_ROLES,
            isBuiltIn: true,
            active: true,
            createdBy: actorId,
            updatedBy: actorId,
        });
        createdCount += 1;
    }

    // Danh muc rieng cho To truong/To pho gui de xuat/phan anh len cap
    // Phuong (KHONG nam trong NHOM_PHAN_ANH - danh muc do la cho cu dan) -
    // dung lai dung co che dieu huong/thong bao da co (broadcast theo vai tro
    // o resolveComplaintTypeRecipientIds, vi ca sender lan receiver o day deu
    // khong thuoc HOUSE_SCOPED_COMPLAINT_ROLES).
    const wardEscalationKey = "to_de_xuat_len_phuong";
    const existingWardEscalation = await ComplaintTypeDefinition.findOne({
        key: wardEscalationKey,
    }).select("_id");
    if (existingWardEscalation) {
        await ComplaintTypeDefinition.updateOne(
            { _id: existingWardEscalation._id },
            { $set: { isBuiltIn: true } },
        );
        alreadyExistedCount += 1;
    } else {
        await ComplaintTypeDefinition.create({
            key: wardEscalationKey,
            name: "Đề xuất/Phản ánh Tổ dân phố gửi Phường",
            allowedSenderRoles: ["neighborhood_leader", "neighborhood_coleader"],
            allowedReceiverRoles: ["secretary", "people_committee_official"],
            isBuiltIn: true,
            active: true,
            createdBy: actorId,
            updatedBy: actorId,
        });
        createdCount += 1;
    }

    console.log("\n==============================================");
    console.log(`Danh muc phan anh tao moi:    ${createdCount}`);
    console.log(`Danh muc phan anh da ton tai: ${alreadyExistedCount}`);
    console.log(
        `Tong so danh muc (NHOM_PHAN_ANH + to_de_xuat_len_phuong): ${NHOM_PHAN_ANH.length + 1}`,
    );
    console.log("==============================================");

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Seed loai phan anh that bai:", err);
    process.exit(1);
});
