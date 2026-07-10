import { connectDB } from "@/lib/mongodb";
import {
    apiSuccess,
    apiErrorFromException,
    paginationParams,
} from "@/lib/response";
import { requireUser, requireRole } from "@/lib/rbac";
import { createFinanceTransactionSchema } from "@/validators/finance";
import { createTransaction, listTransactions } from "@/services/financeService";

export const dynamic = "force-dynamic";

// Gioi han truy cap: hien tai chi role "admin" duoc doc/ghi du lieu tai chinh
// (Cong an khu vuc va cac role khac khong duoc truy cap tru khi duoc cap quyen
// tuong minh). TODO: khi co mang `permissions` tren User, cho phep cap quyen
// rieng cho tung role ma khong can nang thanh admin.

export async function GET(req: Request) {
    try {
        await connectDB();
        const actorUser = await requireUser(req);
        requireRole(actorUser, "admin");

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
        requireRole(actorUser, "admin");

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
