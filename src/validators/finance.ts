import { z } from "zod";
import { LOAI_GIAO_DICH_TAI_CHINH, TRANG_THAI_GIAO_DICH } from "@/types";

export const createFinanceTransactionSchema = z.object({
    type: z.enum(LOAI_GIAO_DICH_TAI_CHINH),
    partyName: z.string().min(1, "Ten nguoi nop/nguoi nhan la bat buoc"),
    amount: z.number().positive("So tien phai lon hon 0"),
    transactionDate: z.string().datetime(),
    content: z.string().min(1, "Noi dung la bat buoc"),
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
