import { connectDB } from "@/lib/mongodb";
import { requirePermission, requireUser } from "@/lib/rbac";
import { apiErrorFromException, apiSuccess, HttpError } from "@/lib/response";
import {
    listPeriodicReportAttachments,
    uploadPeriodicReportAttachment,
} from "@/services/periodicReportService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        return apiSuccess(await listPeriodicReportAttachments(actorUser, params.id));
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "reports.author");
        const file = (await req.formData()).get("file");
        if (!(file instanceof File)) throw new HttpError("Thieu file can tai len", 422);
        return apiSuccess(
            await uploadPeriodicReportAttachment(actorUser, params.id, file),
            "Đã tải tệp đính kèm",
            201,
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
