import mongoose, { Schema, type Document, type Model } from "mongoose";
import { VERIFICATION_STATUS, type VerificationStatus } from "@/types";

export interface ICompany extends Document {
    name: string;
    houseId: mongoose.Types.ObjectId;
    cluster: string;
    streetId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    ownerName?: string;
    // Bat buoc - cong ty phai da dang ky ma so thue (khac Business, khong
    // bat buoc). Phai la duy nhat (giong Organization.taxCode).
    taxCode: string;
    // Lien ket toi tai khoan thuc su cua nguoi dai dien cong ty (cung ly do
    // voi Business.representativeUserId - xem ghi chu o do).
    representativeUserId?: mongoose.Types.ObjectId;
    // Lien ket TUY CHON toi Organization khi cong ty dang hoat dong tai nha
    // nay CHINH LA (hoac thuoc ve) mot phap nhan da dang ky trong so Organization
    // (vd cung mot cong ty vua so huu nha khac vua dang ky hoat dong o day) -
    // khong bat buoc, khong suy ra tu dong (Company va Organization la hai
    // khai niem khac nhau: Company gan voi MOT nha cu the va co quy trinh xac
    // minh rieng, Organization la so dang ky phap nhan dung lam ownerType cho
    // HouseOwnership - xem ghi chu tai models/Organization.ts).
    organizationId?: mongoose.Types.ObjectId;
    // Loai hinh kinh doanh (BusinessType) - KHAC Business.businessType (mot
    // gia tri duy nhat): mot cong ty/doanh nghiep co the dang ky nhieu nganh
    // nghe/loai hinh cung luc nen day la MANG tham chieu, khong phai 1 gia
    // tri. Khong co quy trinh giay to rieng theo tung loai (khac
    // BusinessType.requiredDocuments danh cho Business) - cong ty van dung
    // chung RequiredDocumentSettings category "company" (xem
    // requiredDocumentAdapters.ts).
    businessTypeIds: mongoose.Types.ObjectId[];
    phone?: string;
    active: boolean;
    // Trang thai xac thuc CUA CHINH cong ty nay - doc lap voi trang thai cua
    // nha so cha, giong Business/Household (xem VerificationStatus o
    // types/index.ts). Khac Business: khong co quy trinh nop/duyet giay to
    // rieng (BusinessDocument) - chuyen trang thai hoan toan thu cong qua
    // companyService.transitionCompanyStatus.
    status: VerificationStatus;
    approvalNote?: string;
    denialReason?: string;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
    {
        name: { type: String, required: true, trim: true },
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        cluster: { type: String, required: true, index: true },
        // Chuan hoa cua `cluster` (xem src/lib/streetSync.ts), sao chep tu
        // HouseRecord lien ket luc tao, giong cluster cua Business.
        streetId: { type: Schema.Types.ObjectId, ref: "Street", index: true },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        ownerName: { type: String, trim: true },
        // sparse: ky thuat can thiet de unique index hoat dong dung (xem
        // ghi chu Organization.taxCode) - ve mat nghiep vu truong nay bat
        // buoc, duoc ep boi createCompanySchema (validators/company.ts).
        taxCode: { type: String, unique: true, trim: true, sparse: true },
        representativeUserId: { type: Schema.Types.ObjectId, ref: "User" },
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            index: true,
        },
        businessTypeIds: {
            type: [{ type: Schema.Types.ObjectId, ref: "BusinessType" }],
            default: [],
        },
        phone: { type: String, trim: true },
        active: { type: Boolean, default: true },
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

CompanySchema.index({ name: "text" });

export default (mongoose.models.Company as Model<ICompany>) ||
    mongoose.model<ICompany>("Company", CompanySchema);
