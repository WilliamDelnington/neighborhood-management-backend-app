import { z } from "zod";
import { TRANG_THAI_PHAN_ANH } from "@/types";

// Permissive - chi kiem tra HINH THUC cua key (cung quy uoc voi
// requestTypeKeySchema trong validators/request.ts). Gia tri THUC te (co
// ton tai mot ComplaintTypeDefinition active tuong ung, hoac thuoc danh sach
// NHOM_PHAN_ANH cu trong giai doan migrate) duoc kiem tra o service layer -
// xem assertValidComplaintCategory trong complaintService.ts.
const complaintCategoryKeySchema = z
    .string()
    .min(1, "Thieu nhom phan anh")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Nhom phan anh khong hop le");

export const createComplaintSchema = z.object({
    category: complaintCategoryKeySchema,
    title: z.string().min(3, "Tieu de qua ngan"),
    content: z.string().min(10, "Noi dung qua ngan"),
    area: z.string().optional(),
    // Nha so nguoi gui chu dong chon (khong bat buoc, khong can la nha cua
    // chinh ho) - xem createComplaint/resolveComplaintWardCode.
    houseId: z.string().optional(),
    // Id da xin truoc qua POST /api/complaints/draft, dung lam _id cua ban ghi
    // Complaint moi de cac tai lieu da dinh kem tu form tao (xem
    // uploads/token, uploads/attachments) tu dong thuoc ve phan anh nay.
    draftId: z.string().length(24).optional(),
    // Chi co y nghia khi category="ha_tang" - lien ket toi mot tai san cu the
    // trong so ha tang (B11.03), khong bat buoc.
    relatedAssetId: z.string().optional(),
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

export const updateComplaintSchema = z
    .object({
        category: complaintCategoryKeySchema.optional(),
        title: z.string().min(3, "Tieu de qua ngan").optional(),
        content: z.string().min(10, "Noi dung qua ngan").optional(),
    })
    .refine(
        data =>
            data.category !== undefined ||
            data.title !== undefined ||
            data.content !== undefined,
        { message: "Khong co truong nao duoc thay doi" },
    );
export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;

export const requestReevaluationSchema = z.object({
    note: z.string().min(1, "Vui long nhap ly do de nghi xem xet lai"),
});
export type RequestReevaluationInput = z.infer<
    typeof requestReevaluationSchema
>;

export const assignComplaintSchema = z.object({
    primaryAssigneeId: z.string().min(1),
    secondaryAssigneeIds: z.array(z.string()).default([]),
    expectedCompletionDate: z.string().datetime().optional(),
    transferReason: z.string().min(1).optional(),
});
export type AssignComplaintInput = z.infer<typeof assignComplaintSchema>;

export const escalateComplaintSchema = z.object({
    note: z.string().optional(),
});

export const chooseAssigneeSchema = z.object({
    userId: z.string().min(1, "Thieu nguoi phu trach"),
});
export type ChooseAssigneeInput = z.infer<typeof chooseAssigneeSchema>;
