import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    GIOI_TINH,
    IDENTITY_PROVIDERS,
    IDENTITY_VERIFICATION_STATUS,
    LOAI_CU_TRU,
    type GioiTinh,
    type IdentityProvider,
    type IdentityVerificationStatus,
    type LoaiCuTru,
} from "@/types";
import {
    encryptSensitive,
    decryptSensitive,
    isEncryptedSensitive,
    hashForLookup,
    normalizePhone,
    normalizeCccd,
} from "@/lib/encryption";

export interface ICitizen extends Document {
    fullName: string;
    phone?: string;
    cccd?: string;
    phoneHash?: string;
    cccdHash?: string;
    birthDate?: Date;
    gender: GioiTinh;
    relationToHead?: string;
    // Nghe nghiep/noi lam viec - thong tin khai bao thuong, khong nhay cam
    // nhu phone/cccd nen khong ma hoa.
    occupation?: string;
    householdId: mongoose.Types.ObjectId;
    residenceType: LoaiCuTru;
    // Bat buoc khi residenceType="tam_tru" (xem validators/citizen.ts) - ngay
    // bat dau va ket thuc khai bao tam tru, khong ap dung cho thuong_tru.
    temporaryResidenceStartsAt?: Date;
    temporaryResidenceExpiresAt?: Date;
    // Da/chua khai bao cu tru voi UBND - doc lap voi residenceType (thuong
    // tru/tam tru la PHAN LOAI cu tru, con co nay la tinh trang DA THONG BAO
    // phan loai do cho chinh quyen hay chua).
    isResidencyDeclared: boolean;
    identityProvider: IdentityProvider;
    identityVerificationStatus: IdentityVerificationStatus;
    identityVerifiedAt?: Date;
    isElderly: boolean;
    isChild: boolean;
    isDisabledOrSupportNeeded: boolean;
    isDisabledChild: boolean;
    isPartyMember: boolean;
    isUnionMember: boolean;
    isMartyr: boolean;
    isMartyrFamily: boolean;
    isVeteran: boolean;
    isOtherSpecial: boolean;
    // Bat buoc khi isOtherSpecial=true (xem validators/citizen.ts) - mo ta
    // dien khai tu do cho dien uu tien khong nam trong danh sach co san.
    otherSpecialLabel?: string;
    zaloUserId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CitizenSchema = new Schema<ICitizen>(
    {
        fullName: { type: String, required: true, trim: true },
        // phone/cccd luu du lieu da ma hoa AES-256-GCM (xem hook pre("save") ben
        // duoi) - phoneHash/cccdHash la bam HMAC de tim kiem exact-match, vi
        // ciphertext khong the $regex/text-index truc tiep duoc.
        phone: { type: String, trim: true },
        cccd: { type: String, trim: true },
        phoneHash: { type: String, index: true },
        cccdHash: { type: String, index: true },
        birthDate: { type: Date },
        gender: { type: String, enum: GIOI_TINH, default: "nam" },
        relationToHead: { type: String },
        occupation: { type: String, trim: true },
        householdId: {
            type: Schema.Types.ObjectId,
            ref: "Household",
            required: true,
            index: true,
        },
        residenceType: {
            type: String,
            enum: LOAI_CU_TRU,
            default: "thuong_tru",
        },
        temporaryResidenceStartsAt: { type: Date },
        temporaryResidenceExpiresAt: { type: Date },
        isResidencyDeclared: { type: Boolean, default: false },
        // Du lieu nhap tay/CCCD hien tai chi la khai bao. Khong gan nhan
        // "verified" neu chua doi chieu that su qua VNeID/CSDLQGDC.
        identityProvider: {
            type: String,
            enum: IDENTITY_PROVIDERS,
            default: "manual_declaration",
            index: true,
        },
        identityVerificationStatus: {
            type: String,
            enum: IDENTITY_VERIFICATION_STATUS,
            default: "unverified",
            index: true,
        },
        identityVerifiedAt: { type: Date },
        isElderly: { type: Boolean, default: false },
        isChild: { type: Boolean, default: false },
        isDisabledOrSupportNeeded: { type: Boolean, default: false },
        isDisabledChild: { type: Boolean, default: false },
        isPartyMember: { type: Boolean, default: false },
        isUnionMember: { type: Boolean, default: false },
        isMartyr: { type: Boolean, default: false },
        isMartyrFamily: { type: Boolean, default: false },
        isVeteran: { type: Boolean, default: false },
        isOtherSpecial: { type: Boolean, default: false },
        otherSpecialLabel: { type: String, trim: true },
        zaloUserId: { type: Schema.Types.ObjectId, ref: "User" },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    {
        timestamps: true,
        toJSON: {
            transform(_doc, ret) {
                // Nguoi co quyen citizens.read (nhan vien quan ly to dan pho)
                // can xem day du sdt/cccd de lien he/doi chieu ho dan - khong
                // che nua, chi an cac truong noi bo (hash tra cuu).
                delete ret.phoneHash;
                delete ret.cccdHash;
                return ret;
            },
        },
    },
);

CitizenSchema.index({ fullName: "text" });

CitizenSchema.pre("save", function (next) {
    if (this.isModified("phone")) {
        this.phoneHash = this.phone
            ? hashForLookup(normalizePhone(this.phone))
            : undefined;
        if (this.phone) this.phone = encryptSensitive(this.phone);
    }
    if (this.isModified("cccd")) {
        this.cccdHash = this.cccd
            ? hashForLookup(normalizeCccd(this.cccd))
            : undefined;
        if (this.cccd) this.cccd = encryptSensitive(this.cccd);
    }
    next();
});

CitizenSchema.post("init", function (doc) {
    if (doc.phone) doc.phone = decryptSensitive(doc.phone);
    if (doc.cccd) doc.cccd = decryptSensitive(doc.cccd);
});

// pre("save") ma hoa phone/cccd ngay tren `this` truoc khi ghi xuong DB - can
// giai ma lai vao bo nho sau khi save() xong, neu khong doc vua tao/cap nhat
// se giu ciphertext o field phone/cccd (khac voi doc doc tu find(), da duoc
// post("init") giai ma), khien response tra ve ngay sau create/update bi sai.
CitizenSchema.post("save", function (doc) {
    if (doc.phone && isEncryptedSensitive(doc.phone)) {
        doc.phone = decryptSensitive(doc.phone);
    }
    if (doc.cccd && isEncryptedSensitive(doc.cccd)) {
        doc.cccd = decryptSensitive(doc.cccd);
    }
});

export default (mongoose.models.Citizen as Model<ICitizen>) ||
    mongoose.model<ICitizen>("Citizen", CitizenSchema);
