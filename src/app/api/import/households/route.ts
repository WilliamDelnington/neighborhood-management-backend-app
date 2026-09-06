import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { previewHouseholdImport } from "@/services/importService";

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
            file instanceof File ? file.name : "import-ho-dan.xlsx";
        // Tuy chon - chi dinh sheet can doc khi file co nhieu sheet (mac dinh
        // sheet dau tien neu khong truyen, xem readWorksheetRows).
        const sheetName = formData.get("sheetName");

        const job = await previewHouseholdImport(
            String(actorUser._id),
            buffer,
            fileName,
            typeof sheetName === "string" && sheetName ? sheetName : undefined,
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
