import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
    HOUSE_RECORD_STATUS,
    HOUSE_PHYSICAL_STATUS,
    HOUSE_USAGE_TYPE,
    OWNER_TYPE,
    type HouseRecordStatus,
    type HousePhysicalStatus,
    type HouseUsageType,
    type OwnerType,
} from "@/types";

export interface IHouseRecord extends Document {
    code: string;
    cluster: string;
    streetId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    address: string;
    // Phuong/xa va tinh/thanh pho - danh cho hien thi dia chi day du, khong
    // gan voi RBAC/pham vi quan ly nao (khac cluster/neighborhoodId). Khong co
    // collection Province/Ward rieng - nguon "su that" la API cong khai
    // https://provinces.open-api.vn (xem lib/administrativeDivisions.ts),
    // House chi luu lai code+name da chon luc tao/sua (denormalized, giong
    // cach cluster la chuoi tu do).
    provinceCode?: number;
    provinceName?: string;
    wardCode?: number;
    wardName?: string;
    status: HouseRecordStatus;
    // Tinh trang cong trinh thuc te - doc lap voi `status` (trang thai ho so/
    // xac thuc). Khong bat buoc: nha cu chua duoc khai se la undefined, hien
    // thi "Chưa cập nhật" o frontend thay vi gia dinh mot gia tri.
    physicalStatus?: HousePhysicalStatus;
    // Muc dich su dung nha ma chu nha tu khai bao (co the nhieu gia tri dong
    // thoi, vd vua o vua kinh doanh) - doc lap voi HouseUsageUnit (lop gan don
    // vi cho tung Household/Business/Company DA TON TAI). Truong nay chi la
    // "y dinh" khai bao, dung de doi chieu va nhac nho khai bao thieu (xem
    // houseRecordService/UI HouseDetailPage) - khong bat buoc phai co ban ghi
    // Household/Business/Company tuong ung ngay.
    usageTypes: HouseUsageType[];
    // Ghi chu tu do cho muc dich su dung khac ngoai 3 loai co san o tren.
    otherUsageNote?: string;
    // ownerId tro toi User (ownerType="user") hoac Organization
    // (ownerType="organization") - khong dung `ref` tinh vi co the tro toi 2
    // collection khac nhau, resolve thu cong trong service layer (giong
    // pattern FileAsset.relatedModel/relatedId).
    ownerType: OwnerType;
    ownerId?: mongoose.Types.ObjectId;
    note?: string;
    // Ghi chu/ly do duoc nhap tai thoi diem duyet/tu choi gan nhat - khac voi
    // `note` o tren (ghi chu chung, chu nha/admin sua truc tiep tren ho so).
    approvalNote?: string;
    denialReason?: string;
    // Chi tiet can cap nhat khi status = "needs_update" - khac "denied": chu
    // nha van duoc sua ho so (House/Household/Business/Company) va gui lai
    // duyet, khong phai bi tu choi han.
    needsUpdateNote?: string;
    // So khai bao cu tru/tam tru cua nha (do cong an/to dan pho cap) - nguon
    // du lieu duy nhat, duoc man hinh An ninh & Quan ly cu tru hien thi lai
    // (khong luu ban sao tren SecurityRecord).
    residenceDeclarationNumber?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const HouseRecordSchema = new Schema<IHouseRecord>(
    {
        code: { type: String, required: true, unique: true, index: true },
        cluster: { type: String, required: true, index: true },
        // Chuan hoa cua `cluster` (xem src/lib/streetSync.ts) - HouseRecord la
        // nguon "su that" cua cluster/streetId, Household/Business chi sao
        // chep lai tu day.
        streetId: { type: Schema.Types.ObjectId, ref: "Street", index: true },
        // Mot duong/pho co the chay qua nhieu to dan pho, nen to dan pho phai
        // gan truc tiep vao tung nha so (dia chi cu the), khong the suy ra tu
        // Street. Khong tu dong resolve/tao nhu streetId - admin gan thu cong
        // qua man quan ly nha so.
        neighborhoodId: {
            type: Schema.Types.ObjectId,
            ref: "Neighborhood",
            index: true,
        },
        address: { type: String, required: true },
        provinceCode: { type: Number },
        provinceName: { type: String },
        wardCode: { type: Number, index: true },
        wardName: { type: String },
        status: {
            type: String,
            enum: HOUSE_RECORD_STATUS,
            default: "unverified",
            index: true,
        },
        physicalStatus: {
            type: String,
            enum: HOUSE_PHYSICAL_STATUS,
        },
        usageTypes: {
            type: [String],
            enum: HOUSE_USAGE_TYPE,
            default: ["household"],
        },
        otherUsageNote: { type: String },
        // Nguoi/to chuc tao nha so - duoc coi la chu nha, chi minh chu nha nay
        // (hoac admin/nhan vien co quyen quan ly theo cum) duoc thao tac voi
        // nha nay. Xem ownerType o tren de biet ownerId tro toi User hay
        // Organization.
        ownerType: {
            type: String,
            enum: OWNER_TYPE,
            default: "user",
        },
        ownerId: { type: Schema.Types.ObjectId, index: true },
        note: { type: String },
        approvalNote: { type: String },
        denialReason: { type: String },
        needsUpdateNote: { type: String },
        residenceDeclarationNumber: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

HouseRecordSchema.index({ address: "text" });

// Ten model dang ky voi Mongoose van la "House" (khong doi) de giu nguyen
// collection "houses" va cac `ref: "House"` o Household/Business - chi doi
// ten export/interface phia TypeScript de tranh nham lan voi Household.
export default (mongoose.models.House as Model<IHouseRecord>) ||
    mongoose.model<IHouseRecord>("House", HouseRecordSchema);
