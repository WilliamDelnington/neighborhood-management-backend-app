import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { assignScope, listActiveScopeHolders } from "@/services/scopeAssignmentService";
import { assignScopeSchema } from "@/validators/scopeAssignment";

export const dynamic = "force-dynamic";

// Endpoint dung chung cho ca WARD lan NEIGHBORHOOD (xem models/ScopeAssignment.ts).
// Quyen kiem tra THEO scopeType - "wards.manage" cho WARD (WardManagementPage.tsx),
// "neighborhoods.manage" cho NEIGHBORHOOD (dung boi NeighborhoodMembersPanel.tsx -
// cung quyen voi 3 route rieng le truoc day cua leader/coleader/collaborator).
function permissionForScopeType(scopeType: "WARD" | "NEIGHBORHOOD" | undefined) {
    return scopeType === "NEIGHBORHOOD" ? "neighborhoods.manage" : "wards.manage";
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        const { searchParams } = new URL(req.url);
        const roleKey = searchParams.get("roleKey") || undefined;
        const scopeType = searchParams.get("scopeType") as
            | "WARD"
            | "NEIGHBORHOOD"
            | undefined;
        await requirePermission(user, permissionForScopeType(scopeType));
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
        const body = assignScopeSchema.parse(await req.json());
        await requirePermission(user, permissionForScopeType(body.scopeType));
        const assignment = await assignScope(String(user._id), body);
        return apiSuccess(assignment, "Đã phân công phạm vi", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
