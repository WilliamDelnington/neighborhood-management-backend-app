import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { commitCitizenImport, IMPORT_ROLES } from "@/services/importService";

export const dynamic = "force-dynamic";

export async function POST(
    req: Request,
    { params }: { params: { jobId: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, ...IMPORT_ROLES);

        const job = await commitCitizenImport(session.userId, params.jobId);
        return apiSuccess(
            job,
            "Da nhap du lieu nhan khau vao he thong thanh cong",
        );
    } catch (err) {
        return apiErrorFromException(err);
    }
}
