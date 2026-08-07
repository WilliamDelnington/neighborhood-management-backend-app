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
 * Cach chay: npm run users:set-password -- <so_dien_thoai> <mat_khau_moi>
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const [phoneArg, passwordArg] = process.argv.slice(2);
    if (!phoneArg || !passwordArg) {
        console.error(
            "Thieu tham so. Cach dung: npm run users:set-password -- <so_dien_thoai> <mat_khau_moi>",
        );
        process.exit(1);
    }
    if (passwordArg.length < 6) {
        console.error("Mat khau phai co it nhat 6 ky tu");
        process.exit(1);
    }

    const { connectDB } = await import("@/lib/mongodb");
    const { assertNotProtectedDatabase } = await import("@/lib/config");
    const { normalizePhone } = await import("@/lib/encryption");
    const { hashPassword } = await import("@/lib/auth");
    const { User } = await import("../src/models");

    assertNotProtectedDatabase(process.env.MONGODB_URI as string);
    await connectDB();

    const phone = normalizePhone(phoneArg);
    const user = await User.findOne({ phone });
    if (!user) {
        console.error(`Khong tim thay tai khoan voi so dien thoai ${phoneArg}`);
        process.exit(1);
    }

    user.passwordHash = await hashPassword(passwordArg);
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
