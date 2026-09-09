import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createDocumentTypeSchema } from "@/validators/documentType";
import {
    createDocumentType,
    listDocumentTypes,
} from "@/services/documentTypeService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "document_types.read");

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || undefined;
        const activeParam = searchParams.get("active");
        const active =
            activeParam === null
                ? undefined
                : activeParam === "1" || activeParam === "true";
        const hasIssueDateParam = searchParams.get("hasIssueDate");
        const hasIssueDate =
            hasIssueDateParam === null
                ? undefined
                : hasIssueDateParam === "1" || hasIssueDateParam === "true";
        const hasExpiryDateParam = searchParams.get("hasExpiryDate");
        const hasExpiryDate =
            hasExpiryDateParam === null
                ? undefined
                : hasExpiryDateParam === "1" || hasExpiryDateParam === "true";
        const { page, limit } = paginationParams(searchParams);

        const result = await listDocumentTypes({
            search,
            active,
            hasIssueDate,
            hasExpiryDate,
            page,
            limit,
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
        await requirePermission(actorUser, "document_types.create");

        // Client gui multipart/form-data khi kem theo file mau (xem
        // uploadDocumentType o frontend); nguoc lai la JSON thuan.
        const contentType = req.headers.get("content-type") || "";
        let sampleFile: File | undefined;
        let body;
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("sampleFile");
            if (file instanceof File) sampleFile = file;
            body = createDocumentTypeSchema.parse({
                name: formData.get("name") || undefined,
                code: formData.get("code") || undefined,
                description: formData.get("description") || undefined,
                hasIssueDate: formData.get("hasIssueDate") === "true",
                hasExpiryDate: formData.get("hasExpiryDate") === "true",
                active: formData.get("active") !== "false",
            });
        } else {
            body = createDocumentTypeSchema.parse(await req.json());
        }

        const documentType = await createDocumentType(
            String(actorUser._id),
            body,
            sampleFile,
        );
        return apiSuccess(documentType, "Tạo loại giấy tờ thành công", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
