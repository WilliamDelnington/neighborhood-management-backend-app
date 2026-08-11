import { connectDB } from "@/lib/mongodb";
import { apiErrorFromException, apiSuccess } from "@/lib/response";
import { requirePermission, requireUser } from "@/lib/rbac";
import {
    assignNeighborhoodCollaborator,
    getNeighborhoodById,
    listNeighborhoodCollaborators,
    unassignNeighborhoodCollaborator,
} from "@/services/neighborhoodService";
import {
    assignNeighborhoodCollaboratorSchema,
    unassignNeighborhoodCollaboratorSchema,
} from "@/validators/neighborhood";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.read");
        await getNeighborhoodById(params.id, user);
        return apiSuccess(await listNeighborhoodCollaborators(params.id));
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
        const body = assignNeighborhoodCollaboratorSchema.parse(await req.json());
        const assignment = await assignNeighborhoodCollaborator(
            String(user._id),
            params.id,
            body,
        );
        return apiSuccess(assignment, "Da phan cong cong tac vien", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await requirePermission(user, "neighborhoods.manage");
        await getNeighborhoodById(params.id, user);
        const body = unassignNeighborhoodCollaboratorSchema.parse(await req.json());
        await unassignNeighborhoodCollaborator(
            String(user._id),
            params.id,
            body.assignmentId,
        );
        return apiSuccess(null, "Da ket thuc phan cong cong tac vien");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
