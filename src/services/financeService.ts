import { FinanceTransaction, type IFinanceTransaction } from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateFinanceTransactionInput,
    UpdateFinanceTransactionInput,
} from "@/validators/finance";

/**
 * Tao giao dich tai chinh moi. Tai chinh phai minh bach tuyet doi nen moi lan
 * tao deu ghi audit log day du so tien / loai giao dich / doi tac.
 */
export async function createTransaction(
    actorId: string,
    input: CreateFinanceTransactionInput,
) {
    const transaction = await FinanceTransaction.create({
        type: input.type,
        partyName: input.partyName,
        amount: input.amount,
        transactionDate: new Date(input.transactionDate),
        content: input.content,
        status: input.status,
        createdBy: actorId,
    });

    await writeAuditLog({
        actorId,
        action: "finance.create",
        targetModel: "FinanceTransaction",
        targetId: transaction._id,
        metadata: {
            type: transaction.type,
            amount: transaction.amount,
            partyName: transaction.partyName,
        },
    });

    return transaction;
}

export async function listTransactions(params: {
    page: number;
    limit: number;
    type?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
}) {
    const filter: Record<string, unknown> = {};
    if (params.type) filter.type = params.type;
    if (params.status) filter.status = params.status;
    if (params.fromDate || params.toDate) {
        const range: Record<string, Date> = {};
        if (params.fromDate) range.$gte = new Date(params.fromDate);
        if (params.toDate) range.$lte = new Date(params.toDate);
        filter.transactionDate = range;
    }

    const [items, total] = await Promise.all([
        FinanceTransaction.find(filter)
            .sort({ transactionDate: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("createdBy", "displayName")
            .populate("updatedBy", "displayName"),
        FinanceTransaction.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getTransactionById(id: string) {
    const transaction = await FinanceTransaction.findById(id)
        .populate("createdBy", "displayName")
        .populate("updatedBy", "displayName");
    if (!transaction) throw new HttpError("Khong tim thay giao dich", 404);
    return transaction;
}

/**
 * Cap nhat giao dich. Neu so tien thay doi, ghi ca before/after vao audit log
 * de dam bao truy vet duoc lich su chinh sua so lieu tai chinh.
 */
export async function updateTransaction(
    actorId: string,
    id: string,
    patch: UpdateFinanceTransactionInput,
): Promise<IFinanceTransaction> {
    const transaction = await FinanceTransaction.findById(id);
    if (!transaction) throw new HttpError("Khong tim thay giao dich", 404);

    const beforeAmount = transaction.amount;

    if (patch.type !== undefined) transaction.type = patch.type;
    if (patch.partyName !== undefined) transaction.partyName = patch.partyName;
    if (patch.amount !== undefined) transaction.amount = patch.amount;
    if (patch.transactionDate !== undefined) {
        transaction.transactionDate = new Date(patch.transactionDate);
    }
    if (patch.content !== undefined) transaction.content = patch.content;
    if (patch.status !== undefined) transaction.status = patch.status;
    transaction.updatedBy = actorId as any;

    await transaction.save();

    const metadata: Record<string, unknown> = { fields: Object.keys(patch) };
    if (patch.amount !== undefined && patch.amount !== beforeAmount) {
        metadata.amount = { before: beforeAmount, after: patch.amount };
    }

    await writeAuditLog({
        actorId,
        action: "finance.update",
        targetModel: "FinanceTransaction",
        targetId: transaction._id,
        metadata,
    });

    return transaction;
}

/**
 * "Xoa mem" - duong dan uu tien cho viec huy giao dich. Giu lai ban ghi de
 * dam bao minh bach/truy vet, chi chuyen trang thai sang "da_huy".
 */
export async function cancelTransaction(
    actorId: string,
    id: string,
): Promise<IFinanceTransaction> {
    const transaction = await FinanceTransaction.findById(id);
    if (!transaction) throw new HttpError("Khong tim thay giao dich", 404);

    transaction.status = "da_huy";
    transaction.updatedBy = actorId as any;
    await transaction.save();

    await writeAuditLog({
        actorId,
        action: "finance.cancel",
        targetModel: "FinanceTransaction",
        targetId: transaction._id,
        metadata: { status: "da_huy" },
    });

    return transaction;
}

/**
 * Xoa cung - chi danh cho admin don dep du lieu sai/trung. Vi day la thao tac
 * nhay cam (mat vinh vien du lieu tai chinh), luon uu tien dung cancelTransaction
 * (xoa mem) trong nghiep vu thong thuong.
 */
export async function deleteTransaction(
    actorId: string,
    id: string,
): Promise<void> {
    const transaction = await FinanceTransaction.findById(id);
    if (!transaction) throw new HttpError("Khong tim thay giao dich", 404);

    await transaction.deleteOne();

    await writeAuditLog({
        actorId,
        action: "finance.delete",
        targetModel: "FinanceTransaction",
        targetId: id,
        metadata: {
            type: transaction.type,
            amount: transaction.amount,
            partyName: transaction.partyName,
        },
    });
}

export type FinanceSummary = {
    totalIncome: number;
    totalExpense: number;
    net: number;
    byMonth: { month: string; income: number; expense: number; net: number }[];
};

/**
 * Tong hop thu/chi. Giao dich da bi huy (da_huy) khong duoc tinh vao tong so
 * lieu de phan anh dung tinh hinh tai chinh thuc te cua to dan pho.
 */
export async function getFinanceSummary(params: {
    fromDate?: string;
    toDate?: string;
}): Promise<FinanceSummary> {
    const match: Record<string, unknown> = { status: { $ne: "da_huy" } };
    if (params.fromDate || params.toDate) {
        const range: Record<string, Date> = {};
        if (params.fromDate) range.$gte = new Date(params.fromDate);
        if (params.toDate) range.$lte = new Date(params.toDate);
        match.transactionDate = range;
    }

    const totalsResult = (await FinanceTransaction.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalIncome: {
                    $sum: { $cond: [{ $eq: ["$type", "thu"] }, "$amount", 0] },
                },
                totalExpense: {
                    $sum: { $cond: [{ $eq: ["$type", "chi"] }, "$amount", 0] },
                },
            },
        },
    ])) as any[];

    const byMonthResult = (await FinanceTransaction.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: "%Y-%m",
                        date: "$transactionDate",
                    },
                },
                income: {
                    $sum: { $cond: [{ $eq: ["$type", "thu"] }, "$amount", 0] },
                },
                expense: {
                    $sum: { $cond: [{ $eq: ["$type", "chi"] }, "$amount", 0] },
                },
            },
        },
        { $sort: { _id: 1 } },
    ])) as any[];

    const totals = totalsResult[0] || { totalIncome: 0, totalExpense: 0 };

    return {
        totalIncome: totals.totalIncome,
        totalExpense: totals.totalExpense,
        net: totals.totalIncome - totals.totalExpense,
        byMonth: byMonthResult.map(m => ({
            month: m._id as string,
            income: m.income as number,
            expense: m.expense as number,
            net: (m.income as number) - (m.expense as number),
        })),
    };
}
