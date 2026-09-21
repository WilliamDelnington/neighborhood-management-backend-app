/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

/**
 * CHI DOC - khong sua bat ky du lieu nao. In ra tat ca thong tin lien quan de
 * chan doan vi sao mot phan anh cu the khong den duoc vai tro/nguoi nhan mong
 * doi: ban than phan anh (category/neighborhoodId/wardCode/targetHouseId),
 * ComplaintTypeDefinition tuong ung (allowedReceiverRoles/allowedSenderRoles),
 * va TOAN BO user dang giu vai tro co trong allowedReceiverRoles (roles/
 * wardCode/status) + Role doc cua tung vai tro do (scopeType/scopeMechanism).
 *
 * Chay: npx tsx scripts/diagnose-complaint-routing.ts HB-PA-2026-0018
 */
async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const code = process.argv[2];
    if (!code) {
        throw new Error("Thieu tham so: npx tsx scripts/diagnose-complaint-routing.ts <ma-phan-anh>");
    }

    const { connectDB } = await import("@/lib/mongodb");
    const { Complaint, ComplaintTypeDefinition, Role, User, HouseRecord, Neighborhood } =
        await import("../src/models");

    await connectDB();

    const complaint = await Complaint.findOne({ code });
    if (!complaint) {
        throw new Error(`Khong tim thay phan anh voi ma "${code}"`);
    }

    console.log("\n=== PHAN ANH ===");
    console.log({
        _id: String(complaint._id),
        code: complaint.code,
        category: complaint.category,
        status: complaint.status,
        targetHouseId: complaint.targetHouseId ? String(complaint.targetHouseId) : null,
        neighborhoodId: complaint.neighborhoodId ? String(complaint.neighborhoodId) : null,
        cluster: complaint.cluster || null,
        wardCode: complaint.wardCode ?? null,
        createdAt: complaint.createdAt,
    });

    if (complaint.targetHouseId) {
        const house = await HouseRecord.findById(complaint.targetHouseId).select(
            "code address neighborhoodId cluster wardCode",
        );
        console.log("\n=== NHA SO DUOC CHON (targetHouseId) ===");
        console.log(
            house
                ? {
                      _id: String(house._id),
                      code: house.code,
                      address: house.address,
                      neighborhoodId: house.neighborhoodId
                          ? String(house.neighborhoodId)
                          : null,
                      cluster: house.cluster || null,
                      wardCode: house.wardCode ?? null,
                  }
                : "KHONG TIM THAY (targetHouseId tro toi ban ghi da bi xoa?)",
        );
    } else {
        console.log(
            "\n=== NHA SO DUOC CHON (targetHouseId) ===\nKHONG CO - nguoi gui khong chon Nha so cu the khi tao phan anh.",
        );
    }

    if (complaint.neighborhoodId) {
        const neighborhood = await Neighborhood.findById(complaint.neighborhoodId).select(
            "name code wardCode wardName leaderUserId",
        );
        console.log("\n=== TO DAN PHO (neighborhoodId) ===");
        console.log(
            neighborhood
                ? {
                      _id: String(neighborhood._id),
                      name: neighborhood.name,
                      wardCode: neighborhood.wardCode ?? null,
                      wardName: neighborhood.wardName || null,
                      leaderUserId: neighborhood.leaderUserId
                          ? String(neighborhood.leaderUserId)
                          : null,
                  }
                : "KHONG TIM THAY",
        );
    }

    const definition = await ComplaintTypeDefinition.findOne({ key: complaint.category });
    console.log("\n=== COMPLAINT TYPE DEFINITION (key = complaint.category) ===");
    console.log(
        definition
            ? {
                  _id: String(definition._id),
                  key: definition.key,
                  name: definition.name,
                  active: definition.active,
                  isBuiltIn: definition.isBuiltIn,
                  allowedReceiverRoles: definition.allowedReceiverRoles,
                  allowedSenderRoles: definition.allowedSenderRoles,
                  wardCode: (definition as any).wardCode ?? null,
              }
            : `KHONG TIM THAY ComplaintTypeDefinition voi key "${complaint.category}" - dang dung nhanh LEGACY (dinh tuyen inline cu, khong qua allowedReceiverRoles)`,
    );

    if (!definition) {
        console.log("\nHoan tat (khong co danh muc quan tri duoc cho category nay).");
        await import("mongoose").then(m => m.default.connection.close());
        process.exit(0);
    }

    for (const roleKey of definition.allowedReceiverRoles) {
        const role = await Role.findOne({ key: roleKey });
        console.log(`\n=== ROLE "${roleKey}" (trong allowedReceiverRoles) ===`);
        console.log(
            role
                ? {
                      active: role.active,
                      scopeType: role.scopeType,
                      scopeMechanism: role.scopeMechanism,
                  }
                : "KHONG TIM THAY Role nay trong DB",
        );

        const users = await User.find({ roles: roleKey }).select(
            "displayName phone status roles wardCode wardName",
        );
        console.log(`--- Users dang giu vai tro "${roleKey}" (${users.length}) ---`);
        users.forEach(u =>
            console.log({
                _id: String(u._id),
                displayName: u.displayName,
                phone: u.phone,
                status: u.status,
                wardCode: u.wardCode ?? null,
                wardName: u.wardName || null,
                matchesComplaintWard:
                    complaint.wardCode != null
                        ? u.wardCode === complaint.wardCode
                        : "khong xac dinh (phan anh khong co wardCode)",
            }),
        );
    }

    console.log(
        "\n=== KET LUAN: doi chieu voi resolveComplaintTypeRecipientIds trong complaintService.ts ===\n" +
            "- Neu targetHouseId CO va role trong allowedReceiverRoles la neighborhood_leader/neighborhood_coleader/cooperator, " +
            "chi vai tro DAU TIEN (theo thu tu trong mang) resolve duoc >=1 nguoi qua Nha do moi duoc dung (vai tro sau KHONG duoc xet).\n" +
            "- Nguoc lai (regional_police/environment_officer khong thuoc nhom tren): luon roi ve broadcast toi TOAN BO user active giu vai tro do, " +
            "loc theo wardCode CUA NHA SO DUOC CHON (chi khi targetHouseId co gia tri) - neu KHONG chon Nha so, broadcast KHONG loc theo ward (gui cho TAT CA user giu vai tro do, moi ward).\n" +
            "- Neu house.wardCode (o tren) khac wardCode cua user can nhan, ho se KHONG nam trong recipientIds du cung giu dung vai tro.",
    );

    await import("mongoose").then(m => m.default.connection.close());
    process.exit(0);
}

main().catch(err => {
    console.error("Chan doan that bai:", err);
    process.exit(1);
});
