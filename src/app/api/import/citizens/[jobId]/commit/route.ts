import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { commitCitizenImport } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { jobId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "imports.manage");

        const job = await commitCitizenImport(
            String(actorUser._id),
            params.jobId,
        );
        return apiSuccess(
            job,
            "Da nhap du lieu nhan khau vao he thong thanh cong",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
