import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { commitPoiImport } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { jobId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "imports.manage");

        const job = await commitPoiImport(String(actorUser._id), params.jobId);
        return apiSuccess(
            job,
            "Đã nhập dữ liệu điểm tiện ích vào hệ thống thành công",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
