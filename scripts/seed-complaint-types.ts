/* eslint-disable no-console */
/**
 * Tao (idempotent, khong pha huy) mot ComplaintTypeDefinition cho MOI gia tri
 * cua NHOM_PHAN_ANH (danh sach nhom phan anh cu, hardcode trong @/types) -
 * chuan bi chuyen Complaint.category tu enum tinh sang danh muc quan tri duoc
 * (xem complaintTypeDefinitionService.ts). Moi danh muc duoc seed voi
 * isBuiltIn:true va allowedReceiverRoles mac dinh la
 * ["neighborhood_leader", "neighborhood_coleader"] - dung HANH VI DIEU HUONG
 * HIEN TAI cua createComplaint (giao To truong/To pho cua to dan pho chua nha
 * so duoc chon, xem createComplaint truoc khi co ComplaintTypeDefinition).
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
    console.log(`Tong so danh muc (NHOM_PHAN_ANH): ${NHOM_PHAN_ANH.length}`);
    console.log("==============================================");

    await mongoose.connection.close();
    process.exit(0);
}

main().catch(err => {
    console.error("Seed loai phan anh that bai:", err);
    process.exit(1);
});
