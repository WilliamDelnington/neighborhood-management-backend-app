import { z } from "zod";
import { APPOINTMENT_HOLIDAY_TYPES } from "@/models";

const appointmentHolidayBaseSchema = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngay khong hop le (YYYY-MM-DD)"),
    name: z.string().trim().min(1, "Thieu ten ngay nghi/le").max(200),
    type: z.enum(APPOINTMENT_HOLIDAY_TYPES).default("le"),
    // Chi co y nghia voi admin he thong (khong co wardCode rieng) - dung de
    // tao ngay nghi ap dung TOAN BO cac phuong/xa (bo trong) hoac chi rieng
    // mot phuong (dien wardCode) khi thao tac thay. Nhan vien/lanh dao phuong
    // (co san wardCode) luon bi ghi de bang wardCode cua chinh ho, giong quy
    // uoc cua AppointmentService - xem appointmentHolidayService.ts.
    wardCode: z.number().optional(),
    note: z.string().trim().max(500).optional(),
});

export const createAppointmentHolidaySchema = appointmentHolidayBaseSchema;
export type CreateAppointmentHolidayInput = z.infer<
    typeof createAppointmentHolidaySchema
>;

export const updateAppointmentHolidaySchema =
    appointmentHolidayBaseSchema.partial();
export type UpdateAppointmentHolidayInput = z.infer<
    typeof updateAppointmentHolidaySchema
>;
