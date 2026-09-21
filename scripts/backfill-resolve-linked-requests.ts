/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Sua du lieu da bi ket lai boi bug: confirmComplaintResolution (nguoi gui
 * xac nhan phan anh "Hoàn thành") truoc day KHONG dong RequestRecipient con
 * "hoat dong" cua (cac) Request/Cong viec lien ket - vd khi nhan vien dat
 * truc tiep "da_xu_ly" qua updateComplaintStatus (bo qua nhanh dong bo tu
 * Request), Request/Cong viec noi bo van "Chờ xác nhận" (hoac trang thai
 * khac) vinh vien du phan anh da "Hoàn thành" that su (xem
 * autoResolveLinkedRequestRecipients trong complaintService.ts - fix danh
 * cho MOI xac nhan tu day tro di; script nay chi sua cac ban ghi CU da bi
 * ket truoc khi co fix).
 *
 * Quet TOAN BO Complaint dang "hoan_thanh"/"dong", dong (status="resolved")
 * moi RequestRecipient con hoat dong cua Request lien ket toi complaint do.
 * An toan de chay lai nhieu lan (idempotent) - khong con gi de sua o lan
 * chay sau thi khong lam gi ca.
 *
 * Chay cho MOT phan anh cu the: npx tsx scripts/backfill-resolve-linked-requests.ts HB-PA-2026-0019
 * Chay cho TOAN BO du lieu:     npx tsx scripts/backfill-resolve-linked-requests.ts
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const onlyCode = process.argv[2];

    const { connectDB } = await import("@/lib/mongodb");
    const { Complaint, User } = await import("../src/models");
    const { autoResolveLinkedRequestRecipients } = await import(
        "../src/services/complaintService"
    );

    await connectDB();

    const admin = await User.findOne({ roles: "admin" }).sort({ createdAt: 1 });
    if (!admin) {
        throw new Error(
            "Khong tim thay tai khoan admin nao (can it nhat 1 admin de ghi audit log)",
        );
    }

    const filter: Record<string, unknown> = {
        status: { $in: ["hoan_thanh", "dong"] },
    };
    if (onlyCode) filter.code = onlyCode;

    const complaints = await Complaint.find(filter).select("code status");
    if (complaints.length === 0) {
        console.log(
            onlyCode
                ? `Khong tim thay phan anh "${onlyCode}" o trang thai hoan_thanh/dong.`
                : "Khong co phan anh nao dang hoan_thanh/dong.",
        );
        await import("mongoose").then(m => m.default.connection.close());
        process.exit(0);
    }

    console.log(`Dang kiem tra ${complaints.length} phan anh...`);
    let fixedCount = 0;
    for (const complaint of complaints) {
        const { RequestRecipient, Request: RequestModel } = await import(
            "../src/models"
        );
        // eslint-disable-next-line no-await-in-loop
        const requestIds = await RequestModel.find({
            relatedModel: "Complaint",
            relatedId: complaint._id,
        }).distinct("_id");
        // eslint-disable-next-line no-await-in-loop
        const activeBefore = requestIds.length
            ? // eslint-disable-next-line no-await-in-loop
              await RequestRecipient.countDocuments({
                  requestId: { $in: requestIds },
                  status: { $ne: "resolved" },
              })
            : 0;
        if (activeBefore === 0) continue;

        // eslint-disable-next-line no-await-in-loop
        await autoResolveLinkedRequestRecipients(complaint, admin);
        fixedCount += 1;
        console.log(
            `Da dong ${activeBefore} RequestRecipient con hoat dong cho phan anh "${complaint.code}".`,
        );
    }

    console.log(
        fixedCount > 0
            ? `\nHoan tat. Da sua ${fixedCount}/${complaints.length} phan anh.`
            : "\nHoan tat. Khong co phan anh nao can sua (moi Request lien ket deu da resolved).",
    );

    await import("mongoose").then(m => m.default.connection.close());
    process.exit(0);
}

main().catch(err => {
    console.error("Backfill that bai:", err);
    process.exit(1);
});
