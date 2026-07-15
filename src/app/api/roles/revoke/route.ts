import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { revokeRole } from "@/services/userService";
import { revokeRoleSchema } from "@/validators/user";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");
        const body = revokeRoleSchema.parse(await req.json());
        const user = await revokeRole(session.userId, body.userId, body.role);
        return apiSuccess(user, "Thu hoi vai tro thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
