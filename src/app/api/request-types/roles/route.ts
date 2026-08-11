import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import Role from "@/models/Role";

export const dynamic = "force-dynamic";

/**
 * Danh sach toi thieu de cau hinh doi tuong cua loai nhiem vu.
 * Khong tai su dung /api/roles vi endpoint do kem permission va thong tin
 * quan tri; nguoi cau hinh bieu mau khong mac nhien duoc xem/sua phan quyen.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "request_types.read");

        const roles = await Role.find({ active: true })
            .select("key name")
            .sort({ sortOrder: 1, name: 1 })
            .lean();

        return apiSuccess(
            roles.map(role => ({
                key: role.key,
                name: role.name,
            })),
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
