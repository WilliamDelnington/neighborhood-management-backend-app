import { z } from "zod";
import {
    APPOINTMENT_SERVICE_SCOPES,
    APPOINTMENT_HOUSE_REQUIREMENTS,
    APPOINTMENT_HOUSE_STATUS_REQUIREMENTS,
    APPOINTMENT_SERVICE_EXCEPTION_TYPES,
} from "@/models";

const timeSlotTimeSchema = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ (HH:mm)");

// _id cua khung gio da ton tai - gui lai khi sua de GIU NGUYEN id (Appointment
// .timeSlotId va AppointmentSlotCounter tham chieu id nay; mat id = bo dem so
// cho da dat bi reset, co the dat vuot suc chua).
const subdocIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Id không hợp lệ")
    .optional();

const dateOnlySchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ (YYYY-MM-DD)");

const timeSlotSchema = z
    .object({
        _id: subdocIdSchema,
        dayOfWeek: z.number().int().min(1).max(7),
        startTime: timeSlotTimeSchema,
        endTime: timeSlotTimeSchema,
        maxCapacity: z.number().int().min(1).max(1000).default(5),
        active: z.boolean().default(true),
    })
    .refine(data => data.startTime < data.endTime, {
        message: "Giờ kết thúc phải sau giờ bắt đầu",
        path: ["endTime"],
    });

const exceptionSlotSchema = z
    .object({
        _id: subdocIdSchema,
        startTime: timeSlotTimeSchema,
        endTime: timeSlotTimeSchema,
        maxCapacity: z.number().int().min(1).max(1000).default(5),
        active: z.boolean().default(true),
    })
    .refine(data => data.startTime < data.endTime, {
        message: "Giờ kết thúc phải sau giờ bắt đầu",
        path: ["endTime"],
    });

// Ngay ngoai le rieng cua dich vu - xem models/AppointmentService.ts.
const serviceExceptionSchema = z
    .object({
        _id: subdocIdSchema,
        date: dateOnlySchema,
        endDate: dateOnlySchema.optional(),
        type: z.enum(APPOINTMENT_SERVICE_EXCEPTION_TYPES),
        note: z.string().trim().max(500).optional(),
        timeSlots: z.array(exceptionSlotSchema).default([]),
    })
    .refine(data => !data.endDate || data.endDate >= data.date, {
        message: "Ngày kết thúc phải từ ngày bắt đầu trở đi",
        path: ["endDate"],
    })
    .refine(data => data.type !== "custom_hours" || data.timeSlots.length > 0, {
        message: "Cần ít nhất một khung giờ khi làm việc khác giờ",
        path: ["timeSlots"],
    });

export type AppointmentServiceExceptionInput = z.infer<
    typeof serviceExceptionSchema
>;

const appointmentServiceBaseSchema = z.object({
    key: z
        .string()
        .trim()
        .min(2, "Mã dịch vụ quá ngắn")
        .max(50)
        .regex(/^[a-z][a-z0-9_]*$/, "Mã chỉ gồm chữ thường, số và gạch dưới"),
    name: z.string().trim().min(1, "Thiếu tên dịch vụ").max(150),
    description: z.string().trim().max(1000).optional(),
    locationAddress: z.string().trim().min(1, "Thiếu địa điểm tiếp dân"),
    scope: z.enum(APPOINTMENT_SERVICE_SCOPES),
    // wardCode: chi dung khi can ghi de wardCode mac dinh (thuong tu dong lay
    // theo actorUser.wardCode - xem appointmentServiceService.ts), khong bat
    // buoc voi da so nguoi tao.
    wardCode: z.number().optional(),
    // Bat buoc khi scope="neighborhood" - kiem tra o refine ben duoi.
    neighborhoodId: z.string().optional(),
    houseRequirement: z
        .enum(APPOINTMENT_HOUSE_REQUIREMENTS)
        .default("required"),
    houseStatusRequirement: z
        .enum(APPOINTMENT_HOUSE_STATUS_REQUIREMENTS)
        .default("verified"),
    slotDurationMinutes: z.number().int().min(5).max(480).default(30),
    autoApprove: z.boolean().default(true),
    assignedOfficerUserIds: z.array(z.string()).default([]),
    timeSlots: z.array(timeSlotSchema).default([]),
    exceptions: z.array(serviceExceptionSchema).default([]),
    active: z.boolean().default(true),
});

export const createAppointmentServiceSchema = appointmentServiceBaseSchema.refine(
    data => data.scope !== "neighborhood" || !!data.neighborhoodId,
    {
        message: "Thiếu tổ dân phố khi phạm vi là tổ dân phố",
        path: ["neighborhoodId"],
    },
);
export type CreateAppointmentServiceInput = z.infer<
    typeof createAppointmentServiceSchema
>;

export const updateAppointmentServiceSchema = appointmentServiceBaseSchema
    .omit({ key: true })
    .partial();
export type UpdateAppointmentServiceInput = z.infer<
    typeof updateAppointmentServiceSchema
>;
