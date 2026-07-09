import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { assignRole, revokeRole } from "@/services/userService";
import { assignRoleSchema } from "@/validators/user";
import { ROLES, type Role } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");
        const body = assignRoleSchema.parse(await req.json());
        const result = await assignRole(session.userId, body);
        return apiSuccess(result, "Gan vai tro thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get("userId");
        const role = searchParams.get("role") as Role | null;
        if (!userId || !role || !ROLES.includes(role)) {
            return apiErrorFromException(
                new Error("Thieu userId hoac role hop le"),
            );
        }
        const user = await revokeRole(session.userId, userId, role);
        return apiSuccess(user, "Thu hoi vai tro thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
