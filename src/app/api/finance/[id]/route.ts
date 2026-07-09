import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireSession, requireRole } from "@/lib/rbac";
import { updateFinanceTransactionSchema } from "@/validators/finance";

export const dynamic = "force-dynamic";
import {
    getTransactionById,
    updateTransaction,
    deleteTransaction,
} from "@/services/financeService";

export async function GET(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");
        const transaction = await getTransactionById(params.id);
        return apiSuccess(transaction);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");
        const body = updateFinanceTransactionSchema.parse(await req.json());
        const transaction = await updateTransaction(
            session.userId,
            params.id,
            body,
        );
        return apiSuccess(transaction, "Cap nhat giao dich thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } },
) {
    try {
        await connectDB();
        const session = requireSession(req);
        requireRole(session, "admin");
        await deleteTransaction(session.userId, params.id);
        return apiSuccess(null, "Xoa giao dich thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
