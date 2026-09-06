import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IRole extends Document {
    key: string;
    name: string;
    description?: string;
    permissions: string[];
    allowedComplaintCategories?: string[];
    allowedRequestTypes?: string[];
    // Vai tro (KHONG ke house_owner - luon mo san cho bat ky ai co
    // "users.create") ma NGUOI GIU vai tro nay duoc phep chon khi "Tạo tài
    // khoản" (xem userService.getCreatableRolesForActor). Khac
    // allowedComplaintCategories/allowedRequestTypes: KHONG dung quy uoc
    // undefined = khong gioi han - default rong (khong duoc tao vai tro nao
    // ngoai house_owner) la lua chon AN TOAN vi day la quyen han nhay cam
    // (tao tai khoan voi vai tro tuy y), phai admin CHOT tung vai tro duoc
    // phep. Admin luon duoc bo qua truong nay (tao duoc bat ky vai tro active
    // nao, tru ACCOUNT_CREATION_RESERVED_ROLE_KEYS - xem validators/user.ts).
    allowedCreatableRoles: string[];
    system: boolean;
    active: boolean;
    sortOrder: number;
    createdBy?: mongoose.Types.ObjectId;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        permissions: { type: [String], default: [], index: true },
        // Khong dat default [] - can phan biet "chua cau hinh" (undefined, xem
        // tat ca nhu truoc day) voi "admin da chot chi cho xem mot so nhom" ([]).
        allowedComplaintCategories: { type: [String], default: undefined },
        // Cung quy uoc voi allowedComplaintCategories: undefined = khong gioi
        // han loai yeu cau duoc gui, [] = admin da chot khong cho gui loai nao.
        allowedRequestTypes: { type: [String], default: undefined },
        allowedCreatableRoles: { type: [String], default: [] },
        system: { type: Boolean, default: false },
        active: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

RoleSchema.index({ active: 1, sortOrder: 1, name: 1 });

export default (mongoose.models.Role as Model<IRole>) ||
    mongoose.model<IRole>("Role", RoleSchema);
