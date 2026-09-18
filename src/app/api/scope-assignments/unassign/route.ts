import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { unassignScopeByTarget } from "@/services/scopeAssignmentService";
import { unassignScopeSchema } from "@/validators/scopeAssignment";

export const dynamic = "force-dynamic";

// Quyen kiem tra theo scopeType - xem ghi chu o route.ts cung thu muc.
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        const body = unassignScopeSchema.parse(await req.json());
        await requirePermission(
            user,
            body.scopeType === "NEIGHBORHOOD"
                ? "neighborhoods.manage"
                : "wards.manage",
        );
        await unassignScopeByTarget(String(user._id), body, body.note);
        return apiSuccess(null, "Đã gỡ phân công phạm vi");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
