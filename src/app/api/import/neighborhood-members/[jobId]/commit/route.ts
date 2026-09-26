import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { commitNeighborhoodMemberImport } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { jobId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "neighborhoods.manage");

        const job = await commitNeighborhoodMemberImport(
            actorUser,
            params.jobId,
        );
        return apiSuccess(job, "Đã nhập dữ liệu thành viên tổ vào hệ thống thành công");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
