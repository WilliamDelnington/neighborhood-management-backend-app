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
        const { page, limit } = paginationParams(searchParams);

        const result = await listDocumentTypes({ search, active, page, limit });
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

        const body = createDocumentTypeSchema.parse(await req.json());
        const documentType = await createDocumentType(
            String(actorUser._id),
            body,
        );
        return apiSuccess(documentType, "Tao loai giay to thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
