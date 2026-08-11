import mongoose, { Schema, type Document, type Model } from "mongoose";
import { TRANG_THAI_PHAN_ANH, type TrangThaiPhanAnh } from "@/types";

// action phan biet Y NGHIA cua ban ghi, status van LUON la trang thai THUC TE
// sau khi hanh dong xay ra (khong doi quy uoc cu):
// - "status_update" (mac dinh, hanh vi cu): nhan vien (hoac nguoi gui qua
//   confirmComplaintResolution) chuyen trang thai.
// - "edited": nguoi gui tu sua noi dung phan anh cua chinh minh - status GIU
//   NGUYEN (khong doi), patch/previousSnapshot ghi lai truong nao thay doi
//   (cung dang voi ChangeRequest.patch/previousSnapshot).
// - "reevaluation_request": nguoi gui tu choi ket qua da_xu_ly, gioi han 1
//   lan/phan anh (xem complaintService.requestComplaintReevaluation) - status
//   luon la "dang_xu_ly" (quay lai xu ly), note la ly do bat buoc.
export const COMPLAINT_TIMELINE_ACTIONS = [
    "status_update",
    "edited",
    "reevaluation_request",
] as const;
export type ComplaintTimelineAction = typeof COMPLAINT_TIMELINE_ACTIONS[number];

export interface IComplaintTimeline extends Document {
    complaintId: mongoose.Types.ObjectId;
    status: TrangThaiPhanAnh;
    action: ComplaintTimelineAction;
    note?: string;
    patch?: Record<string, unknown>;
    previousSnapshot?: Record<string, unknown>;
    isPublic: boolean;
    actorId: mongoose.Types.ObjectId;
    createdAt: Date;
}

const ComplaintTimelineSchema = new Schema<IComplaintTimeline>(
    {
        complaintId: {
            type: Schema.Types.ObjectId,
            ref: "Complaint",
            required: true,
            index: true,
        },
        status: { type: String, enum: TRANG_THAI_PHAN_ANH, required: true },
        action: {
            type: String,
            enum: COMPLAINT_TIMELINE_ACTIONS,
            default: "status_update",
        },
        note: { type: String },
        patch: { type: Schema.Types.Mixed },
        previousSnapshot: { type: Schema.Types.Mixed },
        isPublic: { type: Boolean, default: true },
        actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

export default (mongoose.models
    .ComplaintTimeline as Model<IComplaintTimeline>) ||
    mongoose.model<IComplaintTimeline>(
        "ComplaintTimeline",
        ComplaintTimelineSchema,
    );
