import mongoose, { Schema, type Document, type Model } from "mongoose";

// Diem tien ich (POI) hien tren "Bản đồ tiện ích" o widget Dashboard
// (NeighborhoodZonesMap.tsx) - UBND/Công an/Trạm y tế/Trường học/Chợ.../Chung
// cư. KHAC InfrastructureAsset (tai san ha tang vat ly cua rieng 1 to dan pho:
// den/duong/cong/cay xanh...) - day la diem tien ich CONG CONG cap Phuong,
// khong gan voi 1 to dan pho cu the.
//
// source="scan": tao tu POST /api/pois/scan (do Goong Autocomplete xap xi -
// xem lib/integrations/goong.ts searchPlacesByCategory), CO THE SAI vi Goong
// khong co API tim theo danh muc that - luon tao voi verified=false, BAT BUOC
// admin xem lai truoc khi tin. source="manual": admin tu nhap qua form, mac
// dinh verified=true (da chinh tay thi khong can duyet lai).
export const POI_CATEGORIES = [
    "ubnd",
    "police",
    "atm",
    "clinic",
    "school",
    "post",
    "gas",
    "market",
    "restaurant",
    "cafe",
    "bus",
    "apartment",
] as const;
export type PoiCategory = (typeof POI_CATEGORIES)[number];

export const POI_SOURCES = ["manual", "scan"] as const;
export type PoiSource = (typeof POI_SOURCES)[number];

export interface IPoi extends Document {
    name: string;
    category: PoiCategory;
    lat: number;
    lng: number;
    address?: string;
    verified: boolean;
    source: PoiSource;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const PoiSchema = new Schema<IPoi>(
    {
        name: { type: String, required: true, trim: true },
        category: { type: String, enum: POI_CATEGORIES, required: true, index: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        address: { type: String, trim: true },
        verified: { type: Boolean, default: false, index: true },
        source: { type: String, enum: POI_SOURCES, default: "manual" },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

PoiSchema.index({ name: "text" });

export default (mongoose.models.Poi as Model<IPoi>) ||
    mongoose.model<IPoi>("Poi", PoiSchema);
