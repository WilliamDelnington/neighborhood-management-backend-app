import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { getRequiredDocuments } from "@/services/businessDocumentService";
import { toAbsoluteUploadUrl } from "@/lib/localUpload";

export const dynamic = "force-dynamic";

/**
 * GET /api/businesses/:id/required-documents
 * Tra ve ma tran giay to yeu cau cua ho kinh doanh, gop voi tinh trang
 * nop/duyet hien tai - dung cho ca checklist cua chu ho lan man duyet.
 * Quyen truy cap chi tiet (chu nha hoac nhan vien trong pham vi cum) duoc
 * kiem tra trong service qua assertHouseRecordInScope.
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "businesses.read");

        const result = await getRequiredDocuments(actorUser, params.id);
        const origin = new URL(req.url).origin;
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
