import { z } from "zod";

const dateOnlySchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ (YYYY-MM-DD)");

/**
 * Zod chi kiem tra HINH THUC: proxyName/proxyPhone phai co CA HAI hoac KHONG
 * co gi (khong the goi mot minh). Quy tac NGHIEP VU thuc su - dat cho ai (chinh
 * minh/nguoi khac co tai khoan/dat ho khong tai khoan) va actor co du quyen
 * hay khong - kiem tra o appointmentService.createAppointment (phu thuoc vai
 * tro actor va quan he actor/nha so, khong the kiem tra o day).
 */
export const createAppointmentSchema = z
    .object({
        serviceId: z.string().min(1, "Thiếu dịch vụ"),
        // "Thieu nha so" khi dich vu bat buoc chon nha duoc kiem tra o
        // createAppointment (phu thuoc AppointmentService.houseRequirement),
        // khong the kiem tra thuan hinh thuc o day.
        houseId: z.string().optional(),
        timeSlotId: z.string().min(1, "Thiếu khung giờ"),
        appointedDate: dateOnlySchema,
        note: z.string().trim().max(1000).optional(),
        citizenUserId: z.string().optional(),
        proxyName: z.string().trim().max(150).optional(),
        proxyPhone: z.string().trim().max(20).optional(),
        // Id da xin truoc qua POST /api/appointments/draft, dung lam _id cua
        // ban ghi Appointment moi de tai lieu dinh kem tu form dat lich (xem
        // uploads/token, uploads/attachments) tu dong thuoc ve lich hen nay.
        draftId: z.string().length(24).optional(),
    })
    .refine(data => Boolean(data.proxyName?.trim()) === Boolean(data.proxyPhone?.trim()), {
        message: "Cần nhập đủ họ tên và số điện thoại người được đặt hộ",
        path: ["proxyPhone"],
    });
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const cancelAppointmentSchema = z.object({
    reason: z.string().trim().min(1, "Vui long nhap ly do huy").max(500),
});
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export const rescheduleAppointmentSchema = z.object({
    timeSlotId: z.string().min(1, "Thieu khung gio"),
    appointedDate: dateOnlySchema,
    reason: z.string().trim().min(1, "Vui long nhap ly do doi lich").max(500),
});
export type RescheduleAppointmentInput = z.infer<
    typeof rescheduleAppointmentSchema
>;

export const rejectAppointmentSchema = z.object({
    reason: z.string().trim().min(1, "Vui lòng nhập lý do từ chối"),
});
export type RejectAppointmentInput = z.infer<typeof rejectAppointmentSchema>;

export const rateAppointmentSchema = z.object({
    rating: z.number().int().min(1, "Đánh giá phải từ 1 đến 5 sao").max(5),
    ratingNote: z.string().trim().max(1000).optional(),
});
export type RateAppointmentInput = z.infer<typeof rateAppointmentSchema>;
