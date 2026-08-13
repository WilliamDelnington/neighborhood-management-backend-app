import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import Role from "@/models/Role";

export const dynamic = "force-dynamic";

/**
 * Danh sach toi thieu de cau hinh nguoi nhan cua loai phan anh - cung ly do
 * voi /api/request-types/roles: khong tai su dung /api/roles vi endpoint do
 * kem permission va thong tin quan tri.
 */
export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "complaint_types.read");

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
