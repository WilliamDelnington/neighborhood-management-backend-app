import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { createPcccCheckSchema } from "@/validators/pccc";

export const dynamic = "force-dynamic";
import { createPcccCheck, listPcccChecks } from "@/services/pcccService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "pccc.create");
        const body = createPcccCheckSchema.parse(await req.json());
        const check = await createPcccCheck(actorUser, body);
        return apiSuccess(check, "Tao bien ban kiem tra PCCC thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "pccc.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listPcccChecks({
            page,
            limit,
            riskLevel: searchParams.get("riskLevel") || undefined,
            houseId: searchParams.get("houseId") || undefined,
            actorUser,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
