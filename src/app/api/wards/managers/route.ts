import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { Role, User } from "@/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "wards.manage");
        // Danh sach vai tro cap Phuong la DU LIEU (Role.scopeType="WARD"), khong
        // con hardcode ["secretary","people_committee_official"] - them mot vai
        // tro moi voi scopeType=WARD (vd cau hinh lai qua man Quan ly vai tro)
        // se tu dong hien ra o day, khong can sua code (xem ke hoach
        // "Config-Driven Account Scope System").
        const wardRoles = await Role.find({
            scopeType: "WARD",
            scopeMechanism: "ASSIGNED",
            active: true,
        }).select("key");
        const wardRoleKeys = new Set(wardRoles.map(r => r.key));
        const users = await User.find({
            roles: { $in: [...wardRoleKeys] },
            status: "active",
        })
            .select(
                "displayName phone roles status provinceCode provinceName wardCode wardName",
            )
            .sort({ displayName: 1 });
        return apiSuccess(
            users.map(user => ({
                ...user.toObject(),
                id: String(user._id),
                // Vai tro cap Phuong CU THE trong danh sach roles cua user nay -
                // dung boi frontend de biet truyen roleKey nao khi goi
                // assignScope/unassignScope (xem WardManagementPage.tsx). Mot
                // user chi giu MOT trong cac vai tro cap Phuong tren thuc te.
                wardRoleKey: user.roles.find(r => wardRoleKeys.has(r)),
            })),
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
