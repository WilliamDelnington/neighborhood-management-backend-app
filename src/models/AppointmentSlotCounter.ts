import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * Co che dat cho nguyen tu (atomic capacity reservation) cho tung (dich vu,
 * khung gio, ngay) - tuong duong Mongo cua "optimistic-lock version column"
 * kieu SQL trong tai lieu goc: khong dung transaction/lock rieng, ma dua vao
 * tinh nguyen tu cua MOT lenh findOneAndUpdate (xem createAppointment trong
 * appointmentService.ts):
 *   1) findOneAndUpdate upsert voi $setOnInsert bookedCount:0 - dam bao doc
 *      counter luon ton tai truoc khi dat cho, khong lam thay doi bookedCount
 *      neu da co san.
 *   2) findOneAndUpdate({..., bookedCount: {$lt: maxCapacity}}, {$inc:{bookedCount:1}})
 *      - chi mot request duy nhat "thang" duoc dieu kien loc nay tai moi thoi
 *      diem du nhieu request cung goi dong thoi; tra ve null nghia la het cho
 *      (ERR_SLOT_FULL).
 * Huy/tu choi/vang mat goi $inc bookedCount:-1 (co dieu kien bookedCount:{$gt:0})
 * de tra lai cho da dat.
 */
export interface IAppointmentSlotCounter extends Document {
    serviceId: mongoose.Types.ObjectId;
    timeSlotId: mongoose.Types.ObjectId;
    appointedDate: Date;
    bookedCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const AppointmentSlotCounterSchema = new Schema<IAppointmentSlotCounter>(
    {
        serviceId: {
            type: Schema.Types.ObjectId,
            ref: "AppointmentService",
            required: true,
        },
        timeSlotId: { type: Schema.Types.ObjectId, required: true },
        appointedDate: { type: Date, required: true },
        bookedCount: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true },
);

AppointmentSlotCounterSchema.index(
    { serviceId: 1, timeSlotId: 1, appointedDate: 1 },
    { unique: true },
);

export default (mongoose.models
    .AppointmentSlotCounter as Model<IAppointmentSlotCounter>) ||
    mongoose.model<IAppointmentSlotCounter>(
        "AppointmentSlotCounter",
        AppointmentSlotCounterSchema,
    );
