import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import {
    assignColeaderSchema,
    unassignColeaderSchema,
} from "@/validators/neighborhood";
import {
    assignNeighborhoodColeader,
    unassignNeighborhoodColeader,
    listColeaders,
    getNeighborhoodById,
} from "@/services/neighborhoodService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);

        const coleaders = await listColeaders(params.id);
        return apiSuccess(coleaders);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);

        const body = assignColeaderSchema.parse(await req.json());
        await assignNeighborhoodColeader(
            String(user._id),
            params.id,
            body.coleaderUserId,
            body.note,
        );
        return apiSuccess(null, "Đã gán Tổ phó thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);

        const body = unassignColeaderSchema.parse(await req.json());
        await unassignNeighborhoodColeader(
            String(user._id),
            params.id,
            body.coleaderUserId,
        );
        return apiSuccess(null, "Đã gỡ Tổ phó thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
