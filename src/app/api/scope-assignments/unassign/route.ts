import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { unassignScopeByTarget } from "@/services/scopeAssignmentService";
import { unassignScopeSchema } from "@/validators/scopeAssignment";

export const dynamic = "force-dynamic";

// Xem ghi chu o route.ts cung thu muc - hien chi duoc goi cho WARD.
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "wards.manage");
        const body = unassignScopeSchema.parse(await req.json());
        await unassignScopeByTarget(String(user._id), body, body.note);
        return apiSuccess(null, "Đã gỡ phân công phạm vi");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
