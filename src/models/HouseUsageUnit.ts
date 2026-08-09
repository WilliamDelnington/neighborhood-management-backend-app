import mongoose, { Schema, type Document, type Model } from "mongoose";
import { HOUSE_USAGE_TYPE, type HouseUsageType } from "@/types";

export interface IHouseUsageUnit extends Document {
    houseId: mongoose.Types.ObjectId;
    unitLabel: string;
    usageType: HouseUsageType;
    // Chi dung DUNG MOT trong ba truong duoi day, khop voi usageType - validate
    // o pre("validate") ben duoi (khong dung refPath vi moi truong tro toi mot
    // collection co dinh khac nhau, giong pattern HouseRecord.ownerId).
    householdId?: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
    companyId?: mongoose.Types.ObjectId;
    note?: string;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const HouseUsageUnitSchema = new Schema<IHouseUsageUnit>(
    {
        houseId: {
            type: Schema.Types.ObjectId,
            ref: "House",
            required: true,
            index: true,
        },
        unitLabel: { type: String, required: true, trim: true },
        usageType: {
            type: String,
            enum: HOUSE_USAGE_TYPE,
            required: true,
        },
        householdId: { type: Schema.Types.ObjectId, ref: "Household" },
        businessId: { type: Schema.Types.ObjectId, ref: "Business" },
        companyId: { type: Schema.Types.ObjectId, ref: "Company" },
        note: { type: String },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

// Mot Household/Business/Company chi duoc gan vao TOI DA mot don vi su dung -
// sparse de khong tinh cac ban ghi khong dung truong tuong ung.
HouseUsageUnitSchema.index({ householdId: 1 }, { unique: true, sparse: true });
HouseUsageUnitSchema.index({ businessId: 1 }, { unique: true, sparse: true });
HouseUsageUnitSchema.index({ companyId: 1 }, { unique: true, sparse: true });

/**
 * Bat buoc dung DUNG MOT trong ba truong tham chieu, va phai khop voi
 * usageType - chan o tang model (ngoai validate() da co o Zod) de tranh du
 * lieu sai lech ke ca khi tao/sua truc tiep qua service khac Zod schema.
 */
HouseUsageUnitSchema.pre("validate", function (next) {
    const refs = [this.householdId, this.businessId, this.companyId].filter(
        Boolean,
    );
    if (refs.length !== 1) {
        return next(
            new Error(
                "HouseUsageUnit phai co dung mot trong householdId/businessId/companyId",
            ),
        );
    }
    const expected =
        this.usageType === "household"
            ? this.householdId
            : this.usageType === "business"
              ? this.businessId
              : this.companyId;
    if (!expected) {
        return next(
            new Error("Truong tham chieu khong khop voi usageType"),
        );
    }
    next();
});

export default (mongoose.models.HouseUsageUnit as Model<IHouseUsageUnit>) ||
    mongoose.model<IHouseUsageUnit>("HouseUsageUnit", HouseUsageUnitSchema);
