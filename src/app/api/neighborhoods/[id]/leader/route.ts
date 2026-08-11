import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { assignLeaderSchema } from "@/validators/neighborhood";
import {
    assignNeighborhoodLeader,
    getNeighborhoodById,
} from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function PUT(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);

        const body = assignLeaderSchema.parse(await req.json());
        const neighborhood = await assignNeighborhoodLeader(
            String(user._id),
            params.id,
            body.leaderUserId,
            body.note,
            { termId: body.termId, endAt: body.endAt },
        );
        return apiSuccess(neighborhood, "Cap nhat to truong thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
