import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireRole, requireSession, requireUser } from "@/lib/rbac";
import { createSecurityRecordSchema } from "@/validators/security";

export const dynamic = "force-dynamic";
import {
    createSecurityRecord,
    listSecurityRecords,
    SECURITY_READ_ROLES,
    SECURITY_WRITE_ROLES,
} from "@/services/securityService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...SECURITY_WRITE_ROLES);
        const actorUser = await requireUser(req);
        const body = createSecurityRecordSchema.parse(await req.json());
        const record = await createSecurityRecord(actorUser, body);
        return apiSuccess(record, "Tao ho so an ninh thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...SECURITY_READ_ROLES);
        const actorUser = await requireUser(req);

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listSecurityRecords({
            page,
            limit,
            level: searchParams.get("level") || undefined,
            householdId: searchParams.get("householdId") || undefined,
            actorUser,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
