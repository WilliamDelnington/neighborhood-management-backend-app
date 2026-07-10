import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { commitCitizenImport, IMPORT_ROLES } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { jobId: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, ...IMPORT_ROLES);

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
