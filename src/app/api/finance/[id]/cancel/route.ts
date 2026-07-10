import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { cancelTransaction } from "@/services/financeService";

export const dynamic = "force-dynamic";

// Duong dan uu tien de "xoa mem" mot giao dich: chuyen trang thai sang da_huy
// thay vi xoa han khoi database, giu lai lich su de minh bach tai chinh.
export async function POST(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, "admin");
        const transaction = await cancelTransaction(
            String(actorUser._id),
            params.id,
        );
        return apiSuccess(transaction, "Da huy giao dich");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
