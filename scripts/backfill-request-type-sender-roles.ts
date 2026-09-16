/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * Sua du lieu CU: 4 loai nhiem vu "he thong" (pccc/security/other/task,
 * isBuiltIn=true - xem scripts/seed-request-types.ts) chi duoc gan
 * allowedSenderRoles MOT LAN DUY NHAT luc tao (= danh sach vai tro dang giu
 * quyen "requests.create" TAI THOI DIEM DO) - cac lan seed sau KHONG ghi de
 * truong nay nua, de tranh xoa mat tuy chinh cua admin qua man quan ly.
 *
 * He qua: khi mot vai tro MOI duoc cap them quyen "requests.create" sau nay
 * (vd neighborhood_leader/neighborhood_coleader, xem systemRoles.ts) ma cac
 * ban ghi built-in nay da ton tai tu truoc, vai tro do se KHONG nam trong
 * allowedSenderRoles cua ca 4 loai, khien getAvailableRequestTypes loc rong -
 * nguoi dung thay o "Loại yêu cầu" khi tao yeu cau moi hoan toan trong, du ho
 * co quyen "requests.create". Day chinh la loi da phat hien 2026-09-15
 * (neighborhood_leader tren dev khong chon duoc loai yeu cau nao).
 *
 * Script nay CHI UNION (them vai tro con thieu vao allowedSenderRoles cua cac
 * ban ghi isBuiltIn=true), KHONG BAO GIO xoa bot vai tro da co san - an toan
 * voi tuy chinh hien tai cua admin (neu admin co chu dich bo mot vai tro nao
 * do ra khoi mot loai cu the, gia tri do van duoc giu nguyen, chi thieu vai
 * tro MOI duoc them permission requests.create sau nay moi duoc bo sung).
 * KHONG dong den cac loai nhiem vu TUY CHINH (isBuiltIn=false) - allowedSenderRoles
 * cua nhung loai do la lua chon co chu dich cua admin tu luc tao, khong lien
 * quan den quyen "requests.create" noi chung.
 *
 * An toan de chay lai nhieu lan (idempotent).
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { RequestTypeDefinition } = await import("../src/models");
    const { getRoleKeysWithPermission } = await import("../src/lib/rbac");

    await connectDB();

    const rolesWithCreate = await getRoleKeysWithPermission("requests.create");
    console.log(
        `Vai trò đang giữ quyền "requests.create": ${rolesWithCreate.join(", ") || "(rỗng)"}`,
    );

    const builtInTypes = await RequestTypeDefinition.find({ isBuiltIn: true });
    let updatedCount = 0;

    for (const type of builtInTypes) {
        const current = new Set(type.allowedSenderRoles || []);
        const missing = rolesWithCreate.filter(role => !current.has(role));
        if (missing.length === 0) {
            console.log(`"${type.key}": đã đủ, không cần sửa.`);
            // eslint-disable-next-line no-continue
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await RequestTypeDefinition.updateOne(
            { _id: type._id },
            { $addToSet: { allowedSenderRoles: { $each: missing } } },
        );
        console.log(`"${type.key}": đã thêm ${missing.join(", ")} vào allowedSenderRoles.`);
        updatedCount += 1;
    }

    console.log(
        `\nHoàn tất. Đã sửa ${updatedCount}/${builtInTypes.length} loại nhiệm vụ built-in.`,
    );
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
