/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Dat mat khau cho MOT tai khoan co san theo so dien thoai - dung cho dev/test
 * khi tai khoan duoc tao qua luong "quick add" khong co mat khau (vd
 * houseRecordService.resolveOrCreateHouseOwner, houseOwnershipService.resolveExistingOwnerId)
 * va chua tich hop OTP that (xem services/otpService.ts - hien chi la stub
 * console.log ma OTP, khong gui SMS/ZNS that) nen khong the tu dang nhap qua
 * OTP hay tu dat mat khau qua POST /api/auth/set-password (yeu cau da dang
 * nhap truoc). Sau khi chay, dang nhap qua man "Dang nhap bang so dien thoai"
 * (chi hien khi build dev, xem LoginPage.tsx o mini app) voi so dien thoai +
 * mat khau vua dat.
 *
 * Cach chay: npm run users:set-password -- <so_dien_thoai> [mat_khau_moi] [--yes]
 * Mat khau: tham so thu 2, hoac bien moi truong NEW_USER_PASSWORD dat SAN
 * truoc khi chay, hoac bo trong de duoc hoi an tren terminal. Chay duoc tren
 * database production (phai go lai ten database de xac nhan, hoac --yes).
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const args = process.argv.slice(2);
    const assumeYes = args.includes("--yes") || args.includes("-y");
    const [phoneArg, passwordArg] = args.filter(a => a !== "--yes" && a !== "-y");
    if (!phoneArg) {
        console.error(
            "Thieu tham so. Cach dung: npm run users:set-password -- <so_dien_thoai> [mat_khau_moi] [--yes]",
        );
        process.exit(1);
    }

    const { connectDB } = await import("@/lib/mongodb");
    const { normalizePhone } = await import("@/lib/encryption");
    const { hashPassword } = await import("@/lib/auth");
    const { User } = await import("../src/models");
    const { confirmProductionTarget, resolvePassword } = await import(
        "./lib/cliPrompt"
    );

    await confirmProductionTarget(process.env.MONGODB_URI as string, assumeYes);
    const password = await resolvePassword(passwordArg);
    if (password.length < 6) {
        console.error("Mat khau phai co it nhat 6 ky tu");
        process.exit(1);
    }
    await connectDB();

    const phone = normalizePhone(phoneArg);
    const user = await User.findOne({ phone });
    if (!user) {
        console.error(`Khong tim thay tai khoan voi so dien thoai ${phoneArg}`);
        process.exit(1);
    }

    user.passwordHash = await hashPassword(password);
    await user.save();

    console.log(
        `Da dat mat khau moi cho tai khoan "${user.displayName}" (${phone}, vai tro: ${user.roles.join(", ")}).`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
