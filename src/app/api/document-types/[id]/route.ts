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

        const contentType = req.headers.get("content-type") || "";
        let sampleFile: File | undefined;
        let removeSampleFile = false;
        let body;
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("sampleFile");
            if (file instanceof File) sampleFile = file;
            removeSampleFile = formData.get("removeSampleFile") === "true";
            body = updateDocumentTypeSchema.parse({
                name: formData.get("name") || undefined,
                description: formData.get("description") || undefined,
                hasIssueDate: formData.has("hasIssueDate")
                    ? formData.get("hasIssueDate") === "true"
                    : undefined,
                hasExpiryDate: formData.has("hasExpiryDate")
                    ? formData.get("hasExpiryDate") === "true"
                    : undefined,
                active: formData.has("active")
                    ? formData.get("active") === "true"
                    : undefined,
            });
        } else {
            body = updateDocumentTypeSchema.parse(await req.json());
        }

        const documentType = await updateDocumentType(
            String(actorUser._id),
            params.id,
            body,
            { sampleFile, removeSampleFile },
        );
        return apiSuccess(documentType, "Cập nhật loại giấy tờ thành công");
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
        return apiSuccess(result, "Xóa loại giấy tờ thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
