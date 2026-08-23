import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getRequiredDocuments } from "@/services/requiredDocumentService";
import { householdDocumentAdapter } from "@/services/requiredDocumentAdapters";
import { toAbsoluteUploadUrl, getPublicOrigin } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/households/:id/required-documents
 * Tra ve ma tran giay to yeu cau cua mot ho dan, gop voi tinh trang nop/duyet
 * hien tai - dung cho ca checklist cua chu ho lan man duyet.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "households.read");

        const result = await getRequiredDocuments(
            actorUser,
            params.id,
            householdDocumentAdapter,
        );
        const origin = getPublicOrigin(req);
        const fixUrl = (doc: (typeof result.items)[number]["activeDocument"]) => {
            const fileAsset = doc?.fileAssetId as any;
            if (fileAsset && typeof fileAsset === "object" && fileAsset.url) {
                fileAsset.url = toAbsoluteUploadUrl(fileAsset.url, origin);
            }
        };
        result.items.forEach(item => {
            fixUrl(item.activeDocument);
            item.history.forEach(fixUrl);
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
