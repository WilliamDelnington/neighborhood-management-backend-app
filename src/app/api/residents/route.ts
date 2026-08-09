import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import { createResidentRecordSchema } from "@/validators/resident";

export const dynamic = "force-dynamic";
import {
    createResidentRecord,
    listResidentRecords,
} from "@/services/residentService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "residents.create");
        const body = createResidentRecordSchema.parse(await req.json());
        const record = await createResidentRecord(actorUser, body);
        return apiSuccess(record, "Tao ho so cu tru thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "residents.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listResidentRecords({
            page,
            limit,
            houseId: searchParams.get("houseId") || undefined,
            actorUser,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
