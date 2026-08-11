/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();
    const { connectDB } = await import("@/lib/mongodb");
    const { Complaint, ComplaintTimeline } = await import("@/models");
    await connectDB();
    const legacy = ["da_tiep_nhan", "da_chuyen_ubnd"];
    const complaints = await Complaint.find({ status: { $in: legacy } });
    for (const complaint of complaints) {
        const previousStatus = complaint.status;
        complaint.status = "dang_xu_ly";
        await complaint.save();
        await ComplaintTimeline.updateMany(
            { complaintId: complaint._id, status: previousStatus },
            { $set: { status: "dang_xu_ly" } },
        );
    }
    console.log(`Đã chuyển ${complaints.length} phản ánh sang trạng thái đang xử lý.`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
