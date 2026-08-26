import mongoose, { Schema, type Document, type Model } from "mongoose";

// Vong doi nhiem ky (xem neighborhoodService.ts cho toan bo logic chuyen
// trang thai va cac ham resolveTermStatusByDate/advanceNeighborhoodTerms):
//   DRAFT -> NOT_STARTED | IN_PROGRESS | ENDED   (finalize, tu dong theo ngay)
//   NOT_STARTED -> IN_PROGRESS | ENDED           (tu dong khi den/qua ngay bat dau)
//   NOT_STARTED -> CANCELLED                     (huy thu cong, khong can ly do)
//   IN_PROGRESS -> ENDED                         (tu dong khi qua ngay ket thuc - "dung han")
//   IN_PROGRESS -> ENDED (endedEarly=true)        (ket thuc som, BAT BUOC ly do - endNeighborhoodTermEarly)
// DRAFT la trang thai DUY NHAT co the bi XOA (deleteNeighborhoodTerm) - cac
// trang thai con lai chi chuyen tiep, khong bao gio bi xoa (giu lich su).
export const NEIGHBORHOOD_TERM_STATUSES = [
    "DRAFT",
    "NOT_STARTED",
    "IN_PROGRESS",
    "ENDED",
    "CANCELLED",
] as const;
export type NeighborhoodTermStatus =
    (typeof NEIGHBORHOOD_TERM_STATUSES)[number];

export interface INeighborhoodTerm extends Document {
    neighborhoodId: mongoose.Types.ObjectId;
    name: string;
    startAt: Date;
    endAt: Date;
    status: NeighborhoodTermStatus;
    notes?: string;
    // Chi co y nghia khi status = ENDED - phan biet ket thuc dung han (tu
    // dong, khi qua endAt) voi ket thuc som (thu cong, xem endReason).
    endedEarly?: boolean;
    // BAT BUOC khi ket thuc som (endNeighborhoodTermEarly) - khong dung cho
    // cac chuyen trang thai khac (huy/dung han khong can ly do).
    endReason?: string;
    createdBy: mongoose.Types.ObjectId;
    updatedBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const NeighborhoodTermSchema = new Schema<INeighborhoodTerm>(
    {
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            required: true,
            index: true,
        },
        name: { type: String, required: true, trim: true },
        startAt: { type: Date, required: true, index: true },
        endAt: { type: Date, required: true, index: true },
        status: {
            type: String,
            enum: NEIGHBORHOOD_TERM_STATUSES,
            default: "DRAFT",
            index: true,
        },
        notes: { type: String, trim: true },
        endedEarly: { type: Boolean },
        endReason: { type: String, trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true },
);

NeighborhoodTermSchema.index({ neighborhoodId: 1, name: 1 }, { unique: true });
// Toi da MOT nhiem ky IN_PROGRESS cho moi to dan pho tai mot thoi diem - DRAFT
// (co the nhieu ban nhap) va NOT_STARTED (co the nhieu nhiem ky "xep hang")
// khong bi rang buoc nay, chi IN_PROGRESS moi la "dang thuc su dieu hanh".
NeighborhoodTermSchema.index(
    { neighborhoodId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "IN_PROGRESS" } },
);

export default (mongoose.models.NeighborhoodTerm as Model<INeighborhoodTerm>) ||
    mongoose.model<INeighborhoodTerm>("NeighborhoodTerm", NeighborhoodTermSchema);
