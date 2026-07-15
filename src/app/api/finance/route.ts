import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requirePermission } from "@/lib/rbac";
import { createFinanceTransactionSchema } from "@/validators/finance";
import { createTransaction, listTransactions } from "@/services/financeService";

export const dynamic = "force-dynamic";

// Gioi han truy cap qua permission finance.read/finance.create (mac dinh chi
// vai tro "admin" duoc cap trong seed, nhung admin co the cap cho vai tro khac
// qua man hinh quan ly vai tro ma khong can nang thanh admin).

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "finance.read");

        const { searchParams } = new URL(req.url);
        const { page, limit } = paginationParams(searchParams);
        const result = await listTransactions({
            page,
            limit,
            type: searchParams.get("type") || undefined,
            status: searchParams.get("status") || undefined,
            fromDate: searchParams.get("fromDate") || undefined,
            toDate: searchParams.get("toDate") || undefined,
        });
        return apiSuccess(result);
    } catch (err) {
        return apiErrorFromException(err);
    }
}

export async function POST(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        await requirePermission(actorUser, "finance.create");

        const body = createFinanceTransactionSchema.parse(await req.json());
        const transaction = await createTransaction(
            String(actorUser._id),
            body,
        );
        return apiSuccess(transaction, "Tao giao dich thanh cong", 201);
    } catch (err) {
        return apiErrorFromException(err);
    }
}
