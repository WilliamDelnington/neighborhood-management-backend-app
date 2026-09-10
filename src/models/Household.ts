import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    VERIFICATION_STATUS,
    LOAI_SO_HUU,
    DISEASE_STATUS,
    type VerificationStatus,
    type LoaiSoHuu,
    type DiseaseStatus,
} from "@/types";

export interface IHousehold extends Document {
    code: string;
    cluster: string;
    streetId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    address: string;
    headOfHousehold: string;
    headOfHouseholdUserId?: mongoose.Types.ObjectId;
    phone?: string;
    memberCount: number;
    ownershipType: LoaiSoHuu;
    needsSupport: boolean;
    isNearPoor: boolean;
    // Doc lap voi Citizen.isMartyrFamily (co the co nhieu Citizen trong ho dan
    // co gan co "gia dinh liet si" o muc ca nhan) - day la co rieng cua ho dan,
    // do nguoi khai bao tu bat/tat, khong suy ra tu du lieu Citizen.
    isMartyrFamilyHousehold: boolean;
    isLonelyElderly: boolean;
    // Hai co duoi day la TU TINH (khong nhan tu client) - xem
    // citizenService.recomputeHouseholdFlags, duoc dong bo lai moi khi Citizen
    // cua ho dan nay duoc them/sua/xoa/chuyen ho dan.
    hasDisabledChild: boolean;
    hasDisabledPerson: boolean;
    // Tinh trang benh/dich benh cua ho dan - "none" la mac dinh. Khi khac
    // "none", diseaseName bat buoc phai co (xem refine tren
    // createHouseholdSchema trong validators/household.ts).
    diseaseStatus: DiseaseStatus;
    diseaseName?: string;
    houseId?: mongoose.Types.ObjectId;
    // Trang thai xac thuc CUA CHINH ho dan nay - doc lap voi trang thai cua nha
    // so cha (xem VerificationStatus o types/index.ts). "unverified" ngay tu
    // luc tao (ke ca khi khong gan nha so - ho dan "mo coi" khong co gi de cho,
    // van phai duoc xac thuc thu cong sau nay). Xem
    // houseRecordService.resolveInitialVerificationStatus va
    // householdService.transitionHouseholdStatus.
    status: VerificationStatus;
    approvalNote?: string;
    denialReason?: string;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const HouseholdSchema = new Schema<IHousehold>(
    {
        code: { type: String, required: true, unique: true, index: true },
        cluster: { type: String, required: true, index: true },
        // Chuan hoa cua `cluster` (xem src/lib/streetSync.ts) - duoc dong bo
        // tu dong, khong nhap tay truc tiep qua form cu.
        streetId: { type: Schema.Types.ObjectId, ref: "Street", index: true },
        // Suy tu HouseRecord.neighborhoodId cua houseId luc tao (xem
        // householdService.ts) - HouseRecord.neighborhoodId duoc admin gan thu
        // cong nen truong nay co the con trong voi nha chua duoc gan.
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        address: { type: String, required: true },
        headOfHousehold: { type: String, required: true },
        // Lien ket toi tai khoan thuc su cua chu ho (phai co role house_owner) -
        // headOfHousehold (text) van giu de hien thi cho ho chua co tai khoan.
        headOfHouseholdUserId: { type: Schema.Types.ObjectId, ref: "User" },
        phone: { type: String, trim: true },
        memberCount: { type: Number, default: 0 },
        ownershipType: {
            type: String,
            enum: LOAI_SO_HUU,
            default: "chinh_chu",
        },
        needsSupport: { type: Boolean, default: false },
        isNearPoor: { type: Boolean, default: false },
        isMartyrFamilyHousehold: { type: Boolean, default: false },
        isLonelyElderly: { type: Boolean, default: false },
        hasDisabledChild: { type: Boolean, default: false },
        hasDisabledPerson: { type: Boolean, default: false },
        diseaseStatus: {
            type: String,
            enum: DISEASE_STATUS,
            default: "none",
        },
        diseaseName: { type: String, trim: true },
        houseId: { type: Schema.Types.ObjectId, ref: "House", index: true },
        status: {
            type: String,
            enum: VERIFICATION_STATUS,
            default: "unverified",
            index: true,
        },
        approvalNote: { type: String },
        denialReason: { type: String },
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

HouseholdSchema.index({ address: "text", headOfHousehold: "text" });

export default (mongoose.models.Household as Model<IHousehold>) ||
    mongoose.model<IHousehold>("Household", HouseholdSchema);
