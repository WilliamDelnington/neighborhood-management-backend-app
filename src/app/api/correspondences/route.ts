import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createCorrespondenceSchema } from "@/validators/correspondence";
import {
    createCorrespondence,
    listCorrespondences,
} from "@/services/correspondenceService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "correspondences.read");
        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const view = searchParams.get("view");
        const status = searchParams.get("status") || undefined;

        const result = await listCorrespondences({
            page,
            limit,
            view: view === "sent" || view === "received" ? view : undefined,
            status,
            actorUser,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "correspondences.create");
        const body = createCorrespondenceSchema.parse(await req.json());
        const correspondence = await createCorrespondence(actorUser, body);
        return apiSuccess(correspondence, "Tao van ban thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
