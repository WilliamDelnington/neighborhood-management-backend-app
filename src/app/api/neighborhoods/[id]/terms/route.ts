import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import {
    createNeighborhoodTerm,
    getNeighborhoodById,
    listNeighborhoodTerms,
} from "@/services/neighborhoodService";
import { createNeighborhoodTermSchema } from "@/validators/neighborhood";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.read");
        await getNeighborhoodById(params.id, user);
        return apiSuccess(await listNeighborhoodTerms(params.id));
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        const body = createNeighborhoodTermSchema.parse(await req.json());
        const term = await createNeighborhoodTerm(String(user._id), params.id, body);
        return apiSuccess(term, "Tạo nhiệm kỳ thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
