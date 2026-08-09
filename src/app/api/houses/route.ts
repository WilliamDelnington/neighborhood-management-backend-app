import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createHouseRecordSchema } from "@/validators/houseRecord";
import { HOUSE_RECORD_STATUS, type HouseRecordStatus } from "@/types";

export const dynamic = "force-dynamic";
import { createHouseRecord, listHouseRecords } from "@/services/houseRecordService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.create");

        const body = createHouseRecordSchema.parse(await req.json());
        const houseRecord = await createHouseRecord(user, body);
        return apiSuccess(houseRecord, "Tao nha so thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "houses.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const statusParam = searchParams.get("status") || undefined;
        const statusValues = statusParam
            ? statusParam
                  .split(",")
                  .filter((s): s is HouseRecordStatus =>
                      (HOUSE_RECORD_STATUS as readonly string[]).includes(s),
                  )
            : [];
        const status =
            statusValues.length > 1
                ? statusValues
                : statusValues[0] || undefined;
        const result = await listHouseRecords({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            cluster: searchParams.get("cluster") || undefined,
            streetId: searchParams.get("streetId") || undefined,
            neighborhoodId: searchParams.get("neighborhoodId") || undefined,
            wardCode: searchParams.get("wardCode")
                ? Number(searchParams.get("wardCode"))
                : undefined,
            status,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
