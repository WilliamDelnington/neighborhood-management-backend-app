import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { assignRole } from "@/services/userService";
import { assignRoleSchema } from "@/validators/user";

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
