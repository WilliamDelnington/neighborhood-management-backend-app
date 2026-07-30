import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { updateDocumentTypeSchema } from "@/validators/documentType";
import {
    deleteDocumentType,
    getDocumentTypeById,
    updateDocumentType,
} from "@/services/documentTypeService";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "document_types.read");

        const documentType = await getDocumentTypeById(params.id);
        return apiSuccess(documentType);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "document_types.update");

        const body = updateDocumentTypeSchema.parse(await req.json());
        const documentType = await updateDocumentType(
            String(actorUser._id),
            params.id,
            body,
        );
        return apiSuccess(documentType, "Cap nhat loai giay to thanh cong");
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
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "document_types.delete");

        const result = await deleteDocumentType(
            String(actorUser._id),
            params.id,
        );
        return apiSuccess(result, "Xoa loai giay to thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
