import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { uploadStreetImportFile } from "@/services/importService";

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
        const fileName =
            file instanceof File ? file.name : "import-duong-pho.xlsx";

        const job = await uploadStreetImportFile(
            String(actorUser._id),
            buffer,
            fileName,
        );
        return apiSuccess(
            job,
            "Đã đọc file, vui lòng chọn cột dữ liệu tương ứng trước khi xem trước",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
