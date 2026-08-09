import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * Danh tinh duoc khai bao (ten/sdt/email) cho chu nha hoac nguoi dai dien to
 * chuc KHONG tao tai khoan dang nhap - khac Citizen (bat buoc householdId, la
 * so ho khau/nhan khau thuc su, dung cho thong ke dan so/PCCC...) va khac User
 * (co tai khoan). Dung khi ownerType="person" o HouseOwnership/HouseRecord -
 * xem houseRecordService.resolveOrCreatePersonOwner.
 */
export interface IPerson extends Document {
    fullName: string;
    phone?: string;
    email?: string;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const PersonSchema = new Schema<IPerson>(
    {
        fullName: { type: String, required: true, trim: true },
        phone: { type: String, trim: true, index: true },
        email: { type: String, trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Person as Model<IPerson>) ||
    mongoose.model<IPerson>("Person", PersonSchema);
