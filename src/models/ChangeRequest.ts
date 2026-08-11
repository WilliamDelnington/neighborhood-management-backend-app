import mongoose, { Schema, type Document, type Model } from "mongoose";

// Yeu cau thay doi doi voi mot ban ghi da duoc xac minh/khoa - thay the cho
// sua truc tiep. Mot ChangeRequest da duoc quyet dinh (approved/rejected)
// CHINH LA mot ban ghi lich su (khong can model lich su rieng): patch +
// previousSnapshot cho biet gia tri truoc/sau, decidedBy/decidedAt/decisionNote
// cho biet ai duyet va ly do. Xem changeRequestService.ts.
export const CHANGE_REQUEST_TARGET_MODELS = [
    "HouseRecord",
    "HouseOwnership",
    "User",
] as const;
export type ChangeRequestTargetModel =
    typeof CHANGE_REQUEST_TARGET_MODELS[number];

// "transfer_neighborhood": chuyen mot HouseRecord tu to dan pho nay sang to
// dan pho khac - ve mat du lieu chi la update truong neighborhoodId (van dung
// updateHouseRecord de chay lai auto-derive province/ward, xem
// changeRequestService.applyApprovedChange), nhung tach rieng khoi "update"
// vi quyen QUYET DINH khac han: chi PCO, bi thu, hoac To truong/To pho cua
// to dan pho SE NHAN (khong phai bat ky ai co change_requests.decide) - xem
// assertCanDecideTransfer trong changeRequestService.ts.
// "data_discrepancy": sai lech du lieu Nha so phat hien giua he thong va bao
// cao cua To dan pho (vd Phuong ghi so nha 125, To bao 125A) - khac 3 loai
// tren o cho can HAI vong duyet thay vi mot: To dan pho xac nhan/bao cao lai
// truoc (reviewStage="neighborhood_review"), sau do Phuong xac nhan cuoi cung
// (reviewStage="ward_review") moi thuc su ap dung patch. 3 loai con lai
// KHONG bao gio dat reviewStage nen van la mot vong duyet duy nhat nhu truoc -
// xem decideChangeRequest trong changeRequestService.ts.
export const CHANGE_REQUEST_TYPES = [
    "update",
    "unlink",
    "transfer_neighborhood",
    "data_discrepancy",
] as const;
export type ChangeRequestType = typeof CHANGE_REQUEST_TYPES[number];

export const CHANGE_REQUEST_STATUS = [
    "pending",
    "approved",
    "rejected",
    "cancelled",
] as const;
export type ChangeRequestStatus = typeof CHANGE_REQUEST_STATUS[number];

export const CHANGE_REQUEST_REVIEW_STAGES = [
    "neighborhood_review",
    "ward_review",
] as const;
export type ChangeRequestReviewStage =
    typeof CHANGE_REQUEST_REVIEW_STAGES[number];

export interface IChangeRequestStageDecision {
    stage: ChangeRequestReviewStage;
    decidedBy: mongoose.Types.ObjectId;
    decidedAt: Date;
    outcome: string;
    note?: string;
}

export interface IChangeRequest extends Document {
    targetModel: ChangeRequestTargetModel;
    targetId: mongoose.Types.ObjectId;
    requestedBy: mongoose.Types.ObjectId;
    changeType: ChangeRequestType;
    patch?: Record<string, unknown>;
    previousSnapshot?: Record<string, unknown>;
    reason?: string;
    status: ChangeRequestStatus;
    // Chi dung cho changeType="data_discrepancy" - undefined voi 3 loai con
    // lai, giu nguyen hanh vi mot vong duyet cua chung.
    reviewStage?: ChangeRequestReviewStage;
    stageDecisions?: IChangeRequestStageDecision[];
    decidedBy?: mongoose.Types.ObjectId;
    decidedAt?: Date;
    decisionNote?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ChangeRequestSchema = new Schema<IChangeRequest>(
    {
        targetModel: {
            type: String,
            enum: CHANGE_REQUEST_TARGET_MODELS,
            required: true,
            index: true,
        },
        targetId: { type: Schema.Types.ObjectId, required: true, index: true },
        requestedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        changeType: {
            type: String,
            enum: CHANGE_REQUEST_TYPES,
            required: true,
        },
        patch: { type: Schema.Types.Mixed },
        previousSnapshot: { type: Schema.Types.Mixed },
        reason: { type: String, trim: true },
        status: {
            type: String,
            enum: CHANGE_REQUEST_STATUS,
            default: "pending",
            index: true,
        },
        reviewStage: {
            type: String,
            enum: CHANGE_REQUEST_REVIEW_STAGES,
        },
        stageDecisions: [
            {
                _id: false,
                stage: {
                    type: String,
                    enum: CHANGE_REQUEST_REVIEW_STAGES,
                    required: true,
                },
                decidedBy: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                    required: true,
                },
                decidedAt: { type: Date, required: true },
                outcome: { type: String, required: true },
                note: { type: String, trim: true },
            },
        ],
        decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
        decidedAt: { type: Date },
        decisionNote: { type: String, trim: true },
    },
    { timestamps: true },
);

ChangeRequestSchema.index({ targetModel: 1, targetId: 1, status: 1 });

export default (mongoose.models.ChangeRequest as Model<IChangeRequest>) ||
    mongoose.model<IChangeRequest>("ChangeRequest", ChangeRequestSchema);
