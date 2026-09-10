import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    createHouseholdSchema,
    HOUSEHOLD_STATE_KEYS,
    type HouseholdStateKey,
} from "@/validators/household";
import { VERIFICATION_STATUS, type VerificationStatus } from "@/types";

export const dynamic = "force-dynamic";
import { createHousehold, listHouseholds } from "@/services/householdService";

export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "households.create");

        const body = createHouseholdSchema.parse(await req.json());
        const household = await createHousehold(user, body);
        return apiSuccess(household, "Tạo hộ dân thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function GET(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "households.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const statusParam = searchParams.get("status") || undefined;
        const status =
            statusParam &&
            (VERIFICATION_STATUS as readonly string[]).includes(statusParam)
                ? (statusParam as VerificationStatus)
                : undefined;
        // Whitelist truoc khi dua vao Mongo filter (xem listHouseholds) - khong
        // tin truc tiep chuoi client gui len lam ten truong.
        const statesParam = searchParams.get("states");
        const states: HouseholdStateKey[] | undefined = statesParam
            ? statesParam
                  .split(",")
                  .map(s => s.trim())
                  .filter((s): s is HouseholdStateKey =>
                      (HOUSEHOLD_STATE_KEYS as readonly string[]).includes(s),
                  )
            : undefined;
        const result = await listHouseholds({
            page,
            limit,
            search: searchParams.get("search") || undefined,
            cluster: searchParams.get("cluster") || undefined,
            streetId: searchParams.get("streetId") || undefined,
            neighborhoodId: searchParams.get("neighborhoodId") || undefined,
            unassigned: searchParams.get("unassigned") === "true",
            status,
            states: states && states.length > 0 ? states : undefined,
            actorUser: user,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
