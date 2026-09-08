import mongoose, { Schema, type Document, type Model } from "mongoose";

export const APPOINTMENT_SERVICE_SCOPES = ["ward", "neighborhood"] as const;
export type AppointmentServiceScope =
    (typeof APPOINTMENT_SERVICE_SCOPES)[number];

// Nha so co bat buoc de dat lich hay khong: "none" - dich vu khong gan voi
// nha so nao (an luon buoc chon nha o form dat lich), "optional" - cho phep
// dat khong can nha, "required" - bat buoc chon nha (hanh vi mac dinh, giu
// nguyen tuong thich nguoc voi cac dich vu da tao truoc khi co truong nay).
export const APPOINTMENT_HOUSE_REQUIREMENTS = [
    "none",
    "optional",
    "required",
] as const;
export type AppointmentHouseRequirement =
    (typeof APPOINTMENT_HOUSE_REQUIREMENTS)[number];

// Ap dung KHI co nha so duoc chon (houseRequirement != "none" va co houseId):
// "any" - khong kiem tra trang thai/pham vi, "in_scope" - nha phai thuoc pham
// vi cua dich vu (cung to dan pho neu scope="neighborhood", cung phuong/xa
// neu scope="ward"), "verified" - nha phai o trang thai da xac thuc (hanh vi
// mac dinh, giu nguyen tuong thich nguoc - xem resolveBookingSubject cu).
export const APPOINTMENT_HOUSE_STATUS_REQUIREMENTS = [
    "any",
    "in_scope",
    "verified",
] as const;
export type AppointmentHouseStatusRequirement =
    (typeof APPOINTMENT_HOUSE_STATUS_REQUIREMENTS)[number];

// Khung gio trong tuan cua mot dich vu - gioi han theo THU (dayOfWeek, 1=Thu
// Hai...7=Chu Nhat, quy uoc ISO 8601), khong theo ngay cu the: cung mot khung
// gio ap dung lap lai hang tuan, so cho (bookedCount) cho tung NGAY cu the
// duoc theo doi rieng qua AppointmentSlotCounter (xem file do). Giu _id mac
// dinh (khac RequestFormFieldSchema) vi client/API dung chinh _id nay lam
// slot_id/timeSlotId khi dat lich (xem GET .../available-slots).
export interface IAppointmentTimeSlot extends Document {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    maxCapacity: number;
    active: boolean;
}

export interface IAppointmentService extends Document {
    key: string;
    name: string;
    description?: string;
    locationAddress: string;
    scope: AppointmentServiceScope;
    // Denormalized theo scope: "ward" thi lay wardCode/wardName cua nguoi tao
    // (actorUser.wardCode/wardName), "neighborhood" thi lay tu chinh
    // Neighborhood duoc chon - xem appointmentServiceService.ts.
    wardCode?: number;
    wardName?: string;
    neighborhoodId?: mongoose.Types.ObjectId;
    houseRequirement: AppointmentHouseRequirement;
    houseStatusRequirement: AppointmentHouseStatusRequirement;
    slotDurationMinutes: number;
    autoApprove: boolean;
    // Danh sach can bo duoc phan cong phu trach RIENG dich vu nay - chi nhung
    // nguoi nay (hoac admin) moi duoc check-in/hoan-thanh lich hen cua dich vu
    // (xem plan: "per-service assigned staff list", khac blanket role check).
    assignedOfficerUserIds: mongoose.Types.ObjectId[];
    timeSlots: mongoose.Types.DocumentArray<IAppointmentTimeSlot>;
    active: boolean;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const AppointmentTimeSlotSchema = new Schema<IAppointmentTimeSlot>({
    dayOfWeek: { type: Number, required: true, min: 1, max: 7 },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    maxCapacity: { type: Number, default: 5, min: 1 },
    active: { type: Boolean, default: true },
});

const AppointmentServiceSchema = new Schema<IAppointmentService>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        locationAddress: { type: String, required: true, trim: true },
        scope: {
            type: String,
            enum: APPOINTMENT_SERVICE_SCOPES,
            required: true,
        },
        wardCode: { type: Number, index: true },
        wardName: { type: String },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        houseRequirement: {
            type: String,
            enum: APPOINTMENT_HOUSE_REQUIREMENTS,
            default: "required",
        },
        houseStatusRequirement: {
            type: String,
            enum: APPOINTMENT_HOUSE_STATUS_REQUIREMENTS,
            default: "verified",
        },
        slotDurationMinutes: { type: Number, default: 30, min: 5 },
        autoApprove: { type: Boolean, default: true },
        assignedOfficerUserIds: {
            type: [{ type: Schema.Types.ObjectId, ref: "User" }],
            default: [],
        },
        timeSlots: { type: [AppointmentTimeSlotSchema], default: [] },
        active: { type: Boolean, default: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

AppointmentServiceSchema.index({ wardCode: 1, active: 1, name: 1 });
AppointmentServiceSchema.index({ neighborhoodId: 1, active: 1 });

export default (mongoose.models.AppointmentService as Model<IAppointmentService>) ||
    mongoose.model<IAppointmentService>(
        "AppointmentService",
        AppointmentServiceSchema,
    );
