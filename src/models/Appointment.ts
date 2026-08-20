import mongoose, { Schema, type Document, type Model } from "mongoose";

// Trang thai lich hen, dat ten kieu Viet hoa snake_case cung quy uoc voi
// TRANG_THAI_PHAN_ANH cua Complaint: cho_xac_nhan (PENDING) -> da_xac_nhan
// (CONFIRMED) -> da_check_in -> hoan_thanh (COMPLETED); cac nhanh phu: tu_choi
// (REJECTED), da_huy (CANCELLED), vang_mat (NO_SHOW, do scheduler tu dong dat).
export const APPOINTMENT_STATUSES = [
    "cho_xac_nhan",
    "da_xac_nhan",
    "da_check_in",
    "hoan_thanh",
    "tu_choi",
    "da_huy",
    "vang_mat",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface IAppointment extends Document {
    code: string;
    serviceId: mongoose.Types.ObjectId;
    // Id cua subdocument AppointmentService.timeSlots duoc dat - KHONG phai
    // mot ref rieng (khong co collection rieng cho time slot, xem
    // AppointmentService.ts).
    timeSlotId: mongoose.Types.ObjectId;
    houseId: mongoose.Types.ObjectId;
    // Tuy chon: rong khi day la lich dat HO mot cong dan khong co tai khoan
    // (proxy booking, chi to truong/to pho moi duoc dat theo cach nay) - luc
    // do bat buoc phai co proxyName+proxyPhone (xem validators/appointment.ts
    // va createAppointment).
    citizenUserId?: mongoose.Types.ObjectId;
    proxyName?: string;
    proxyPhone?: string;
    bookedByUserId: mongoose.Types.ObjectId;
    appointedDate: Date;
    startTime: string;
    endTime: string;
    note?: string;
    status: AppointmentStatus;
    cancelReason?: string;
    rejectReason?: string;
    checkinTime?: Date;
    completedTime?: Date;
    officerUserId?: mongoose.Types.ObjectId;
    // Ghi lai lan doi lich GAN NHAT (chi cong dan/nguoi dat duoc doi, va chi
    // khi dang "da_xac_nhan" - xem rescheduleAppointment). Chi giu ban ghi
    // TRUOC DO gan nhat (khong phai mang lich su day du) - lich su day du,
    // bat bien theo tung lan doi duoc AuditLog luu lai vinh vien qua action
    // "appointment.reschedule".
    rescheduledFromDate?: Date;
    rescheduledFromStartTime?: string;
    rescheduledFromEndTime?: string;
    rescheduleReason?: string;
    rescheduledAt?: Date;
    // Danh gia cua cong dan sau khi hoan thanh (1-5 sao), tuy chon, chi ghi
    // duoc MOT LAN - xem rateAppointment (cung quy uoc voi Complaint.rating/
    // confirmComplaintResolution).
    rating?: number;
    ratingNote?: string;
    // Danh dau da gui nhac lich (~2 tieng truoc gio hen) - tranh scheduler gui
    // trung nhieu lan, xem checkAppointmentRemindersAndNoShow.
    reminderSentAt?: Date;
    // Danh dau da gui nhac lich rieng cho tier "truoc 1 ngay" (~24 tieng truoc
    // gio hen) - doc lap voi reminderSentAt (tier 2 tieng), ca hai co the cung
    // ton tai tren mot lich hen (nhac 2 lan o hai moc thoi gian khac nhau).
    dayBeforeReminderSentAt?: Date;
    // Denormalized tu AppointmentService tai thoi diem dat lich, dung cho loc
    // theo pham vi phu trach (giong Complaint.wardCode/neighborhoodId).
    wardCode?: number;
    neighborhoodId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
    {
        code: { type: String, required: true, unique: true, index: true },
        serviceId: {
            type: Schema.Types.ObjectId,
            ref: "AppointmentService",
            required: true,
            index: true,
        },
        timeSlotId: { type: Schema.Types.ObjectId, required: true },
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        citizenUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        proxyName: { type: String, trim: true },
        proxyPhone: { type: String, trim: true },
        bookedByUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        appointedDate: { type: Date, required: true, index: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        note: { type: String, trim: true },
        status: {
            type: String,
            enum: APPOINTMENT_STATUSES,
            default: "cho_xac_nhan",
            index: true,
        },
        cancelReason: { type: String, trim: true },
        rejectReason: { type: String, trim: true },
        checkinTime: { type: Date },
        completedTime: { type: Date },
        officerUserId: { type: Schema.Types.ObjectId, ref: "User" },
        rescheduledFromDate: { type: Date },
        rescheduledFromStartTime: { type: String },
        rescheduledFromEndTime: { type: String },
        rescheduleReason: { type: String, trim: true },
        rescheduledAt: { type: Date },
        rating: { type: Number, min: 1, max: 5 },
        ratingNote: { type: String, trim: true },
        reminderSentAt: { type: Date },
        dayBeforeReminderSentAt: { type: Date },
        wardCode: { type: Number, index: true },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

// Dung de kiem tra trung lich (BR-02) va thong ke theo dich vu/khung gio/ngay.
AppointmentSchema.index({ serviceId: 1, timeSlotId: 1, appointedDate: 1 });
AppointmentSchema.index({ status: 1, appointedDate: 1 });

export default (mongoose.models.Appointment as Model<IAppointment>) ||
    mongoose.model<IAppointment>("Appointment", AppointmentSchema);
