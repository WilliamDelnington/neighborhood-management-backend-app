import mongoose, { Schema, type Document, type Model } from "mongoose";

export const APPOINTMENT_HOLIDAY_TYPES = ["le", "tam_ngung"] as const;
export type AppointmentHolidayType = (typeof APPOINTMENT_HOLIDAY_TYPES)[number];

/**
 * Mot ngay cu the (khong phai khoang ngay, khong lap lai) ma van phong ngung
 * tiep nhan dat lich hen - dung de chan dat/doi lich vao ngay do (xem
 * appointmentService.ts: getAvailableSlots/createAppointment/rescheduleAppointment).
 * Bao phu 19.2.8 (ngay le, ke ca le am lich - da duoc quy doi sang duong lich
 * TRUOC KHI luu, xem lunarCalendar o admin frontend) va 19.2.9 (tam ngung tiep
 * nhan dot xuat) - hai truong hop chi khac nhau o `type` de hien thi/bao cao,
 * ve mat chan dat lich thi xu ly giong het nhau.
 *
 * wardCode ĐỂ TRỐNG (undefined) = ap dung cho TOAN BO cac phuong/xa (dung cho
 * cac ngay le quoc gia co dinh - xem scripts/seed-appointment-holidays.ts);
 * co wardCode = chi ap dung rieng cho phuong/xa do (ngay tam ngung dia
 * phuong, hoac le am lich duoc tung phuong tu khai bao rieng vi Chinh phu
 * cong bo lich nghi Tet khac nhau tung nam).
 */
export interface IAppointmentHoliday extends Document {
    date: Date;
    name: string;
    type: AppointmentHolidayType;
    wardCode?: number;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const AppointmentHolidaySchema = new Schema<IAppointmentHoliday>(
    {
        date: { type: Date, required: true, index: true },
        name: { type: String, required: true, trim: true },
        type: {
            type: String,
            enum: APPOINTMENT_HOLIDAY_TYPES,
            default: "le",
        },
        wardCode: { type: Number, index: true },
        note: { type: String, trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

AppointmentHolidaySchema.index({ wardCode: 1, date: 1 });

export default (mongoose.models.AppointmentHoliday as Model<IAppointmentHoliday>) ||
    mongoose.model<IAppointmentHoliday>(
        "AppointmentHoliday",
        AppointmentHolidaySchema,
    );
