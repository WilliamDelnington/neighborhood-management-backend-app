import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException, HttpError } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { previewHouseholdImport, IMPORT_ROLES } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, ...IMPORT_ROLES);

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

        const job = await previewHouseholdImport(
            String(actorUser._id),
            buffer,
            fileName,
        );
        return apiSuccess(
            job,
            "Da doc va kiem tra du lieu, vui long xem truoc ket qua truoc khi commit",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
