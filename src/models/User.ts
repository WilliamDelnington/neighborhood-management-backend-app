import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    IDENTITY_PROVIDERS,
    IDENTITY_VERIFICATION_STATUS,
    USER_STATUS,
    type IdentityProvider,
    type IdentityVerificationStatus,
    type Role,
    type UserStatus,
} from "@/types";
import {
    encryptSensitive,
    decryptSensitive,
    isEncryptedSensitive,
    hashForLookup,
    normalizeIdNumber,
    maskIdNumber,
} from "@/lib/encryption";

export interface IUser extends Document {
    zaloUserId?: string;
    zaloAppUserId?: string;
    displayName: string;
    avatarUrl?: string;
    phone?: string;
    email?: string;
    address?: string;
    // idNumber luu du lieu da ma hoa AES-256-GCM (xem hook pre("save") ben
    // duoi, cung mot pattern voi Citizen.cccd) - idNumberHash la bam HMAC de
    // tim kiem exact-match. Chi ap dung cho tai khoan do nhan vien tao (xem
    // userService.createHouseOwnerByStaff) - khong dung cho tu dang ky.
    idNumber?: string;
    idNumberHash?: string;
    passwordHash?: string;
    roles: Role[];
    primaryRole: Role;
    status: UserStatus;
    identityProvider: IdentityProvider;
    identityVerificationStatus: IdentityVerificationStatus;
    identityVerifiedAt?: Date;
    householdId?: mongoose.Types.ObjectId;
    citizenId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    assignedNeighborhoodIds: mongoose.Types.ObjectId[];
    assignedClusters: string[];
    // Pham vi phuong/xa cho people_committee_official va secretary - cung
    // dang denormalized nhu Neighborhood.wardCode/wardName (nguon du lieu tu
    // https://provinces.open-api.vn, khong co collection Ward/Province rieng).
    // Dung boi wardScopeFilter (rbac.ts) de loc To dan pho/nguoi dung thuoc
    // phuong/xa nay khi PCO gui Cong Van.
    provinceCode?: number;
    provinceName?: string;
    wardCode?: number;
    wardName?: string;
    permissions: string[];
    lastLoginAt?: Date;
    notificationPermission: boolean;
    sessionVersion: number;
    // Khoa dat lich hen hep, RIENG cho module Dat lich hen (khac co che khoa
    // toan tai khoan users.lock) - do checkAppointmentRemindersAndNoShow tu
    // dong dat khi tai khoan vang mat >=3 lan trong 30 ngay gan nhat (BR-04),
    // kiem tra tai thoi diem dat lich (createAppointment). Tu het hieu luc khi
    // qua ngay nay, khong can hanh dong "mo khoa" rieng.
    appointmentBookingLockedUntil?: Date;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        zaloUserId: { type: String, unique: true, sparse: true, index: true },
        zaloAppUserId: { type: String },
        displayName: { type: String, required: true, trim: true },
        avatarUrl: { type: String },
        phone: { type: String, trim: true, unique: true, sparse: true },
        email: { type: String, trim: true },
        address: { type: String, trim: true },
        idNumber: { type: String, trim: true },
        idNumberHash: { type: String, index: true },
        passwordHash: { type: String, select: false },
        // Vai tro la du lieu dong (bang Role), khong con enum tinh - tinh hop le
        // (ton tai, active) duoc kiem tra o service layer (assignRole).
        roles: { type: [String], default: ["house_owner"] },
        primaryRole: { type: String, default: "house_owner" },
        status: { type: String, enum: USER_STATUS, default: "active" },
        // Dang nhap bang so dien thoai la co che tam thoi, khong phai xac minh
        // VNeID. Adapter VNeID/CSDLQGDC sau nay chi can cap nhat 3 truong nay.
        identityProvider: {
            type: String,
            enum: IDENTITY_PROVIDERS,
            default: "phone_temporary",
            index: true,
        },
        identityVerificationStatus: {
            type: String,
            enum: IDENTITY_VERIFICATION_STATUS,
            default: "unverified",
            index: true,
        },
        identityVerifiedAt: { type: Date },
        householdId: { type: Schema.Types.ObjectId, ref: "Household" },
        citizenId: { type: Schema.Types.ObjectId, ref: "Citizen" },
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        assignedNeighborhoodIds: {
            type: [Schema.Types.ObjectId],
            ref: "Neighborhood",
            default: [],
        },
        provinceCode: { type: Number },
        provinceName: { type: String },
        // Ma hanh chinh dong vai tro ward ID cho den khi he thong co Ward
        // collection noi bo; khong tao them wardId song song de tranh lech.
        wardCode: { type: Number, index: true },
        wardName: { type: String },
        // Truong tam thoi (transitional) - cum dan cu dang dang du lieu tu do,
        // giu lai de tuong thich nguoc cho den khi du lieu duoc migrate day du
        // sang Neighborhood (xem Neighborhood.ts / neighborhoodService.ts).
        assignedClusters: { type: [String], default: [] },
        permissions: { type: [String], default: [] },
        lastLoginAt: { type: Date },
        notificationPermission: { type: Boolean, default: false },
        sessionVersion: { type: Number, default: 0 },
        appointmentBookingLockedUntil: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    {
        timestamps: true,
        toJSON: {
            transform(_doc, ret) {
                if (ret.idNumber) ret.idNumber = maskIdNumber(ret.idNumber);
                delete ret.idNumberHash;
                return ret;
            },
        },
    },
);

UserSchema.index({ displayName: "text", phone: "text" });

UserSchema.pre("save", function (next) {
    if (this.isModified("idNumber")) {
        this.idNumberHash = this.idNumber
            ? hashForLookup(normalizeIdNumber(this.idNumber))
            : undefined;
        if (this.idNumber) this.idNumber = encryptSensitive(this.idNumber);
    }
    next();
});

UserSchema.post("init", function (doc) {
    if (doc.idNumber) doc.idNumber = decryptSensitive(doc.idNumber);
});

// pre("save") ma hoa idNumber ngay tren `this` truoc khi ghi xuong DB - can
// giai ma lai vao bo nho sau khi save() xong, neu khong doc vua tao/cap nhat
// se giu ciphertext o field idNumber (khac voi doc doc tu find(), da duoc
// post("init") giai ma), khien response tra ve ngay sau create bi sai.
UserSchema.post("save", function (doc) {
    if (doc.idNumber && isEncryptedSensitive(doc.idNumber)) {
        doc.idNumber = decryptSensitive(doc.idNumber);
    }
});

export default (mongoose.models.User as Model<IUser>) ||
    mongoose.model<IUser>("User", UserSchema);
