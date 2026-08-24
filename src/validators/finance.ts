import { z } from "zod";
import { LOAI_GIAO_DICH_TAI_CHINH, TRANG_THAI_GIAO_DICH } from "@/types";

export const createFinanceTransactionSchema = z.object({
    type: z.enum(LOAI_GIAO_DICH_TAI_CHINH),
    partyName: z.string().min(1, "Tên người nộp/người nhận là bắt buộc"),
    amount: z.number().positive("Số tiền phải lớn hơn 0"),
    transactionDate: z.string().datetime(),
    content: z.string().min(1, "Nội dung là bắt buộc"),
    status: z.enum(TRANG_THAI_GIAO_DICH).default("nhap"),
});
export type CreateFinanceTransactionInput = z.infer<
    typeof createFinanceTransactionSchema
>;

export const updateFinanceTransactionSchema =
    createFinanceTransactionSchema.partial();
export type UpdateFinanceTransactionInput = z.infer<
    typeof updateFinanceTransactionSchema
>;
