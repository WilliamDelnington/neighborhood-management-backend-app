import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { assignScope, listActiveScopeHolders } from "@/services/scopeAssignmentService";
import { assignScopeSchema } from "@/validators/scopeAssignment";

export const dynamic = "force-dynamic";

// Endpoint dung chung cho ca WARD lan NEIGHBORHOOD (xem models/ScopeAssignment.ts),
// nhung hien tai CHI duoc UI goi cho WARD (WardManagementPage.tsx - xem ke
// hoach "Config-Driven Account Scope System"). Neighborhood van dung 3 bang
// rieng (NeighborhoodLeaderAssignment/Coleader/Collaborator) qua
// neighborhoodService.ts nhu truoc - CHUA di qua endpoint nay. Vi vay tam thoi
// chi kiem tra "wards.manage"; khi noi UI To dan pho vao day, can doi lai
// permission theo scopeType (vd "neighborhoods.manage" cho NEIGHBORHOOD).
export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "wards.manage");
        const { searchParams } = new URL(req.url);
        const roleKey = searchParams.get("roleKey") || undefined;
        const scopeType = searchParams.get("scopeType") as
            | "WARD"
            | "NEIGHBORHOOD"
            | undefined;
        const scopeIdParam = searchParams.get("scopeId");
        const scopeId = scopeIdParam
            ? scopeType === "WARD"
                ? Number(scopeIdParam)
                : scopeIdParam
            : undefined;
        const holders = await listActiveScopeHolders({ roleKey, scopeType, scopeId });
        return apiSuccess(holders);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "wards.manage");
        const body = assignScopeSchema.parse(await req.json());
        const assignment = await assignScope(String(user._id), body);
        return apiSuccess(assignment, "Đã phân công phạm vi", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
