import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser } from "@/lib/rbac";
import { revokeSessions } from "@/services/authService";

export const dynamic = "force-dynamic";

/**
 * JWT la stateless nen khong the "thu hoi" 1 token cu the. Logout se tang sessionVersion
 * cua user, khien MOI token da phat hanh (kem ca token hien tai) het hieu luc ngay lap tuc.
 * Day cung chinh la co che dung cho "Reset/thu hoi phien dang nhap" cua admin (userService).
 */
export async function POST(req: Request) {
    try {
        await connectDB();
        const user = await requireUser(req);
        await revokeSessions(String(user._id));
        return apiSuccess(null, "Da dang xuat");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
