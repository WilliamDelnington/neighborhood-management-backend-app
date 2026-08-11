import mongoose, { Schema, type Document, type Model } from "mongoose";
import { ORGANIZATION_TYPE, type OrganizationType } from "@/types";

export interface IOrganization extends Document {
    name: string;
    // Khong bat buoc - khong phai to chuc nao cung co ma so thue/dang ky kinh
    // doanh (vd to chuc cong dong, doan the chua thanh lap phap nhan). Khi co,
    // van dung de tim-hoac-tao (khong tao trung) va bao loi trung lap - xem
    // organizationService.createOrganization va
    // houseRecordService.resolveOrCreateOrganizationOwner.
    taxCode?: string;
    organizationType: OrganizationType;
    // CACHE cua ban ghi OrganizationRepresentative (role="legal_representative")
    // dang active - nguon su that thuc su la collection OrganizationRepresentative
    // (ho tro nhieu nguoi dai dien, lich su, uy quyen tam thoi, xac thuc/thu
    // hoi - xem organizationRepresentativeService.ts), duoc dong bo lai day boi
    // syncPrimaryRepresentativeCache moi khi thay doi, giong het cach
    // HouseRecord.ownerId/ownerType la cache cua HouseOwnership. KHONG sua
    // truc tiep hai truong nay - chi doc nhanh khi khong can join (populate,
    // resolveActingUserId...). Optional: to chuc duoc khai bao luc tao nha so
    // co the chua co nguoi dai dien nao dang nhap duoc (xem
    // houseRecordService.resolveOrCreateOrganizationOwner) - khi do to chuc
    // chi hien thi thong tin lien he (phone/email/address) cua chinh no, khong
    // co ai "thao tac thay".
    representativeUserId?: mongoose.Types.ObjectId;
    representativeRole?: string;
    phone?: string;
    email?: string;
    address?: string;
    active: boolean;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
    {
        name: { type: String, required: true, trim: true, index: true },
        // sparse: cho phep nhieu ban ghi cung khong co taxCode ma khong vi
        // pham unique index (MongoDB sparse index bo qua ban ghi thieu han
        // truong, khac voi gia tri null/rong).
        taxCode: { type: String, unique: true, trim: true, sparse: true },
        organizationType: {
            type: String,
            enum: ORGANIZATION_TYPE,
            default: "khac",
        },
        representativeUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        representativeRole: { type: String, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, trim: true },
        address: { type: String, trim: true },
        active: { type: Boolean, default: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

export default (mongoose.models.Organization as Model<IOrganization>) ||
    mongoose.model<IOrganization>("Organization", OrganizationSchema);
