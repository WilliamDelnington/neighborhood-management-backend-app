import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { previewHouseImport } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "imports.manage");

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof Blob)) {
            throw new HttpError(
                "Vui long tai len file Excel (.xlsx) voi truong 'file'",
                400,
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = file instanceof File ? file.name : "import-nha-so.xlsx";
        const defaultCluster = formData.get("defaultCluster");
        const neighborhoodId = formData.get("neighborhoodId");

        const job = await previewHouseImport(
            String(actorUser._id),
            buffer,
            fileName,
            {
                defaultCluster:
                    typeof defaultCluster === "string"
                        ? defaultCluster
                        : undefined,
                neighborhoodId:
                    typeof neighborhoodId === "string"
                        ? neighborhoodId
                        : undefined,
            },
        );
        return apiSuccess(
            job,
            "Đã đọc và kiểm tra dữ liệu, vui lòng xem trước kết quả trước khi commit",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
