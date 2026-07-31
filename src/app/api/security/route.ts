import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { createSecurityRecordSchema } from "@/validators/security";

export const dynamic = "force-dynamic";
import {
    createSecurityRecord,
    listSecurityRecords,
} from "@/services/securityService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "security.create");
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
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "security.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listSecurityRecords({
            page,
            limit,
            level: searchParams.get("level") || undefined,
            monitoringStatus: searchParams.get("monitoringStatus") || undefined,
            houseId: searchParams.get("houseId") || undefined,
            actorUser,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
