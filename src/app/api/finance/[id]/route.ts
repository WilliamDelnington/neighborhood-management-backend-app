import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiErrorFromException } from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
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
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "finance.read");
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
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "finance.update");
        const body = updateFinanceTransactionSchema.parse(await req.json());
        const transaction = await updateTransaction(
            String(actorUser._id),
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
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "finance.delete");
        await deleteTransaction(String(actorUser._id), params.id);
        return apiSuccess(null, "Xoa giao dich thanh cong");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
