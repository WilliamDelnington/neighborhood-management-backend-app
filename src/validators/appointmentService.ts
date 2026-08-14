import { z } from "zod";
import { APPOINTMENT_SERVICE_SCOPES } from "@/models";

const timeSlotTimeSchema = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Gio khong hop le (HH:mm)");

const timeSlotSchema = z
    .object({
        dayOfWeek: z.number().int().min(1).max(7),
        startTime: timeSlotTimeSchema,
        endTime: timeSlotTimeSchema,
        maxCapacity: z.number().int().min(1).max(1000).default(5),
        active: z.boolean().default(true),
    })
    .refine(data => data.startTime < data.endTime, {
        message: "Gio ket thuc phai sau gio bat dau",
        path: ["endTime"],
    });

const appointmentServiceBaseSchema = z.object({
    key: z
        .string()
        .trim()
        .min(2, "Ma dich vu qua ngan")
        .max(50)
        .regex(/^[a-z][a-z0-9_]*$/, "Ma chi gom chu thuong, so va gach duoi"),
    name: z.string().trim().min(1, "Thieu ten dich vu").max(150),
    description: z.string().trim().max(1000).optional(),
    locationAddress: z.string().trim().min(1, "Thieu dia diem tiep dan"),
    scope: z.enum(APPOINTMENT_SERVICE_SCOPES),
    // wardCode: chi dung khi can ghi de wardCode mac dinh (thuong tu dong lay
    // theo actorUser.wardCode - xem appointmentServiceService.ts), khong bat
    // buoc voi da so nguoi tao.
    wardCode: z.number().optional(),
    // Bat buoc khi scope="neighborhood" - kiem tra o refine ben duoi.
    neighborhoodId: z.string().optional(),
    slotDurationMinutes: z.number().int().min(5).max(480).default(30),
    autoApprove: z.boolean().default(true),
    assignedOfficerUserIds: z.array(z.string()).default([]),
    timeSlots: z.array(timeSlotSchema).default([]),
    active: z.boolean().default(true),
});

export const createAppointmentServiceSchema = appointmentServiceBaseSchema.refine(
    data => data.scope !== "neighborhood" || !!data.neighborhoodId,
    {
        message: "Thieu to dan pho khi pham vi la to dan pho",
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
