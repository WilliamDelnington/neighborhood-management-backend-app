import mongoose, { Schema, type Document, type Model } from "mongoose";
import { HOUSE_RECORD_STATUS, type HouseRecordStatus } from "@/types";

export interface IHouseRecord extends Document {
    code: string;
    cluster: string;
    streetId?: mongoose.Types.ObjectId;
    neighborhoodId?: mongoose.Types.ObjectId;
    address: string;
    status: HouseRecordStatus;
    ownerId?: mongoose.Types.ObjectId;
    note?: string;
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
        status: {
            type: String,
            enum: HOUSE_RECORD_STATUS,
            default: "unverified",
            index: true,
        },
        // Nguoi tao nha so - duoc coi la chu nha, chi minh nguoi nay (hoac
        // admin/nhan vien co quyen quan ly theo cum) duoc thao tac voi nha nay.
        ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
        note: { type: String },
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
