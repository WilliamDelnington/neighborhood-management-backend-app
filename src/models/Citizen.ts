import mongoose, { Schema, type Document, type Model } from "mongoose";
import { GIOI_TINH, LOAI_CU_TRU, type GioiTinh, type LoaiCuTru } from "@/types";
import {
    encryptSensitive,
    decryptSensitive,
    isEncryptedSensitive,
    hashForLookup,
    normalizePhone,
    normalizeCccd,
    maskPhone,
    maskCccd,
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
    householdId: mongoose.Types.ObjectId;
    residenceType: LoaiCuTru;
    isElderly: boolean;
    isChild: boolean;
    isDisabledOrSupportNeeded: boolean;
    isPartyMember: boolean;
    isUnionMember: boolean;
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
        isElderly: { type: Boolean, default: false },
        isChild: { type: Boolean, default: false },
        isDisabledOrSupportNeeded: { type: Boolean, default: false },
        isPartyMember: { type: Boolean, default: false },
        isUnionMember: { type: Boolean, default: false },
        zaloUserId: { type: Schema.Types.ObjectId, ref: "User" },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    {
        timestamps: true,
        toJSON: {
            transform(_doc, ret) {
                if (ret.phone) ret.phone = maskPhone(ret.phone);
                if (ret.cccd) ret.cccd = maskCccd(ret.cccd);
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
