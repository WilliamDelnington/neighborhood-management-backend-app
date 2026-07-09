import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { revokeSessions } from "@/services/authService";
import { writeAuditLog } from "@/services/auditService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");
        await revokeSessions(params.id);
        await writeAuditLog({
            actorId: session.userId,
            action: "user.revoke_session",
            targetModel: "User",
            targetId: params.id,
        });
        return apiSuccess(null, "Da thu hoi phien dang nhap");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
