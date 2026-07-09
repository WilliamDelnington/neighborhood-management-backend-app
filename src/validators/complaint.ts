import { z } from "zod";
import { NHOM_PHAN_ANH, TRANG_THAI_PHAN_ANH } from "@/types";

export const createComplaintSchema = z.object({
    category: z.enum(NHOM_PHAN_ANH),
    title: z.string().min(3, "Tieu de qua ngan"),
    content: z.string().min(10, "Noi dung qua ngan"),
    area: z.string().optional(),
    images: z.array(z.string()).max(6).optional(),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

export const updateComplaintStatusSchema = z.object({
    status: z.enum(TRANG_THAI_PHAN_ANH),
    note: z.string().optional(),
    isPublic: z.boolean().default(true),
});
export type UpdateComplaintStatusInput = z.infer<
    typeof updateComplaintStatusSchema
>;

export const assignComplaintSchema = z.object({
    assigneeId: z.string().min(1),
    expectedCompletionDate: z.string().datetime().optional(),
});
export type AssignComplaintInput = z.infer<typeof assignComplaintSchema>;

export const escalateComplaintSchema = z.object({
    note: z.string().optional(),
});
