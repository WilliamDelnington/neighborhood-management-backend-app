/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * CHI DOC (read-only, khong ghi/sua gi ca) - bao cao co bao nhieu tai khoan
 * dang giu vai tro "cooperator" (vai tro CU, tu truoc khi co
 * neighborhood_collaborator - xem LEGACY_COOPERATOR_ROLE_KEY trong
 * lib/systemRoles.ts). Dung de tra loi cau hoi con lai truoc khi don dep hoan
 * toan nhanh xu ly "cooperator" rai rac trong code (rbac.ts/complaintService.ts/
 * inspectionService.ts/neighborhoodService.ts): vai tro nay con thuc su duoc
 * dung hay da chet han.
 *
 * Chay: npm run roles:check-cooperator-usage
 *
 * Doc ket qua:
 * - 0 tai khoan: an toan de xoa han moi cho phep cooperator trong code (bo
 *   LEGACY_COOPERATOR_ROLE_KEY/isCollaboratorOrLegacyCooperator, tra ve chi
 *   con neighborhood_collaborator).
 * - > 0 tai khoan: KHONG xoa voi - hoac (a) chay them mot script backfill rieng
 *   de doi vai tro "cooperator" sang "neighborhood_collaborator" tren cac tai
 *   khoan nay (neu xac nhan chung thuc su la "cung mot vai tro, khac ten"), hoac
 *   (b) neu quyet dinh giu cooperator nhu mot vai tro rieng bieteu (pham vi cum,
 *   khac pham vi To dan pho cua neighborhood_collaborator), them
 *   SYSTEM_ROLE_PERMISSIONS["cooperator"] de tai khoan nay co permission thuc
 *   su thay vi rong nhu hien tai (xem getUserPermissionSet - vai tro khong co
 *   trong bang Role se khong cong permission nao ca).
 *
 * Cac module cua app phai duoc import DONG (dynamic import) sau khi loadEnv()
 * chay - xem scripts/backfill-encrypt-citizens.ts de biet ly do.
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { User } = await import("../src/models");

    if (!process.env.MONGODB_URI) {
        throw new Error("Missing MONGODB_URI (check .env.local)");
    }
    await connectDB();

    const cooperators = await User.find({ roles: "cooperator" }).select(
        "phone displayName roles status assignedClusters createdAt",
    );

    console.log(`Tai khoan dang giu vai tro "cooperator": ${cooperators.length}`);
    if (cooperators.length === 0) {
        console.log(
            "\n=> Khong con tai khoan nao giu vai tro nay. An toan de xoa han " +
                "cac nhanh xu ly cooperator trong code (rbac.ts/complaintService.ts/" +
                "inspectionService.ts/neighborhoodService.ts, xem " +
                "LEGACY_COOPERATOR_ROLE_KEY trong lib/systemRoles.ts).",
        );
    } else {
        console.log(
            "\n=> VAN CON tai khoan dang giu vai tro nay - KHONG xoa cac nhanh xu " +
                "ly cooperator trong code. Xem chi tiet danh sach ben duoi de quyet " +
                "dinh: doi sang neighborhood_collaborator (neu la cung mot vai tro, " +
                "khac ten) hay giu rieng bieteu (them SYSTEM_ROLE_PERMISSIONS " +
                "['cooperator'] de tai khoan co permission thuc su).\n",
        );
        for (const user of cooperators) {
            console.log(
                `  - ${user.displayName} (${user.phone}) - trang thai: ${user.status}, ` +
                    `assignedClusters: [${(user.assignedClusters || []).join(", ")}], ` +
                    `vai tro khac: [${user.roles.filter(r => r !== "cooperator").join(", ") || "(khong co)"}], ` +
                    `tao luc: ${user.createdAt?.toISOString?.() || user.createdAt}`,
            );
        }
    }
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
