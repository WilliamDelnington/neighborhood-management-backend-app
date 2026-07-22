/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { connectDB } from "@/lib/mongodb";
import { Complaint, User } from "../src/models";
import { resolveComplaintCluster } from "../src/services/complaintService";

/**
 * Dien cluster cho cac Complaint da ton tai truoc khi co truong nay (xem
 * models/Complaint.ts). An toan de chay nhieu lan - chi cap nhat cac ban ghi
 * chua co cluster. Phan anh khong the xac dinh cluster (tai khoan tao da bi
 * xoa, hoac chua co ho khau/nhan khau/cum phu trach tai thoi diem gui) se
 * duoc bao cao rieng va giu nguyen cluster: undefined - van hien voi admin,
 * chi bi loai khoi danh sach cua nhan vien da duoc gan cum cu the.
 */
async function main() {
    await connectDB();

    const complaints = await Complaint.find({
        cluster: { $exists: false },
    }).select("_id createdByUserId");
    console.log(`Tim thay ${complaints.length} phan anh chua co cluster.`);

    let updated = 0;
    let unresolved = 0;

    for (const complaint of complaints) {
        const user = await User.findById(complaint.createdByUserId);
        const cluster = user ? await resolveComplaintCluster(user) : undefined;
        if (cluster) {
            await Complaint.updateOne(
                { _id: complaint._id },
                { $set: { cluster } },
            );
            updated += 1;
        } else {
            unresolved += 1;
            console.log(
                `Khong xac dinh duoc cluster cho phan anh ${complaint._id} (nguoi tao: ${complaint.createdByUserId})`,
            );
        }
    }

    console.log(
        `\nHoan tat. Da cap nhat ${updated} phan anh, ${unresolved} phan anh khong the xac dinh cluster (van xem duoc boi admin).`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
