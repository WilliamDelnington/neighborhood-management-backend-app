import mongoose, { Schema, type Document, type Model } from "mongoose";

export const NEIGHBORHOOD_STATUSES = [
    "ACTIVE",
    "INACTIVE",
    "MERGED",
    "CLOSED",
] as const;
export type NeighborhoodStatus = (typeof NEIGHBORHOOD_STATUSES)[number];

export const NEIGHBORHOOD_BOUNDARY_TYPES = ["NONE", "DOCUMENT", "GEOJSON"] as const;
export type NeighborhoodBoundaryType = (typeof NEIGHBORHOOD_BOUNDARY_TYPES)[number];

export interface INeighborhood extends Document {
    name: string;
    code: string;
    sequence: number;
    active: boolean;
    status: NeighborhoodStatus;
    effectiveFrom?: Date;
    effectiveTo?: Date;
    // Phuong/xa (+ tinh/thanh pho) ma to dan pho nay thuoc ve - bat buoc CHI
    // luc tao qua API (xem createNeighborhoodSchema), KHONG bat buoc o tang
    // Mongoose/TS: to dan pho tao truoc khi co truong nay se khong co gia tri,
    // va van phai .save() duoc binh thuong cho cac thao tac khac (vd gan to
    // truong o assignNeighborhoodLeader) - neu dat required:true o day thi
    // moi .save() tren cac to dan pho cu se bi chan boi Mongoose validation.
    // Nguon du lieu tu API cong khai https://provinces.open-api.vn (xem
    // lib/administrativeDivisions.ts), khong co collection Ward/Province
    // rieng. Nha so chon to dan pho nay se tu dong lay lai phuong/xa tu day,
    // ghi de gia tri client gui (xem houseRecordService.resolveAdministrativeDivisions)
    // - to dan pho la nguon "su that" cho phuong/xa cua no.
    provinceCode?: number;
    provinceName?: string;
    wardCode?: number;
    wardName?: string;
    address?: string;
    description?: string;
    contactPhone?: string;
    notes?: string;
    streetIds: mongoose.Types.ObjectId[];
    alleyDescriptions: string[];
    boundaryType: NeighborhoodBoundaryType;
    geometry?: {
        type: "Polygon" | "MultiPolygon";
        coordinates: unknown[];
    };
    leaderUserId?: mongoose.Types.ObjectId;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const NeighborhoodSchema = new Schema<INeighborhood>(
    {
        name: { type: String, required: true, trim: true },
        code: { type: String, required: true, index: true, trim: true },
        sequence: { type: Number, required: true, unique: true, index: true },
        active: { type: Boolean, default: true, index: true },
        status: {
            type: String,
            enum: NEIGHBORHOOD_STATUSES,
            default: "ACTIVE",
            index: true,
        },
        effectiveFrom: { type: Date, index: true },
        effectiveTo: { type: Date, index: true },
        provinceCode: { type: Number },
        provinceName: { type: String },
        wardCode: { type: Number, index: true },
        wardName: { type: String },
        address: { type: String, trim: true },
        description: { type: String, trim: true },
        contactPhone: { type: String, trim: true },
        notes: { type: String },
        streetIds: [{ type: Schema.Types.ObjectId, ref: "Street" }],
        alleyDescriptions: [{ type: String, trim: true }],
        boundaryType: {
            type: String,
            enum: NEIGHBORHOOD_BOUNDARY_TYPES,
            default: "NONE",
        },
        geometry: { type: Schema.Types.Mixed },
        leaderUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

// Ma To chi can duy nhat trong cung Phuong/Xa. Partial index giu tuong thich
// voi du lieu cu chua co wardCode; service van kiem tra trung ma cho nhom cu.
NeighborhoodSchema.index(
    { wardCode: 1, code: 1 },
    {
        unique: true,
        partialFilterExpression: {
            wardCode: { $type: "number" },
            code: { $type: "string" },
        },
    },
);

export default (mongoose.models.Neighborhood as Model<INeighborhood>) ||
    mongoose.model<INeighborhood>("Neighborhood", NeighborhoodSchema);
