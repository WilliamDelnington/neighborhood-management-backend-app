import mongoose, { Schema, type Document, type Model } from "mongoose";
import { NEIGHBORHOOD_COLLABORATOR_SCOPES } from "./NeighborhoodCollaboratorAssignment";

// Pham vi du lieu (data range) vai tro nay duoc quan ly - "soft-coded" thay vi
// hardcode theo ten vai tro rai rac trong rbac.ts/tung feature service (xem
// rbac.resolveScopeFilter). ALL = khong gioi han (admin). WARD/NEIGHBORHOOD =
// pham vi dia ly, gan qua ScopeAssignment (xem scopeMechanism ben duoi).
// HOUSE/HOUSEHOLD/BUSINESS/COMPANY = pham vi theo thuc the so huu (house_owner/
// household_head/business_representative/company_representative), suy ra tu
// truong so huu san co tren chinh du lieu do (HouseRecord.ownerId,
// Household.headOfHouseholdUserId, Business/Company.representativeUserId),
// KHONG can ScopeAssignment.
export const ACCESS_SCOPE_TIERS = [
    "ALL",
    "WARD",
    "NEIGHBORHOOD",
    "HOUSE",
    "HOUSEHOLD",
    "BUSINESS",
    "COMPANY",
] as const;
export type AccessScopeTier = (typeof ACCESS_SCOPE_TIERS)[number];

// ASSIGNED = pham vi lay tu ban ghi ScopeAssignment (staff duoc gan vao mot
// Phuong/To dan pho cu the). OWNED = pham vi suy ra tu truong so huu san co
// tren du lieu (khong co ScopeAssignment tuong ung). Can truong nay rieng vi
// scopeType khong du de resolver biet di theo huong nao (vd WARD/NEIGHBORHOOD
// deu la ASSIGNED, nhung HOUSE/HOUSEHOLD/BUSINESS/COMPANY deu la OWNED).
export const SCOPE_ASSIGNMENT_MECHANISMS = ["ASSIGNED", "OWNED"] as const;
export type ScopeAssignmentMechanism =
    (typeof SCOPE_ASSIGNMENT_MECHANISMS)[number];

export interface IRole extends Document {
    key: string;
    name: string;
    description?: string;
    permissions: string[];
    allowedComplaintCategories?: string[];
    allowedRequestTypes?: string[];
    scopeType: AccessScopeTier;
    scopeMechanism?: ScopeAssignmentMechanism;
    // Chi co y nghia khi scopeMechanism === "ASSIGNED". 1 = chi 1 nguoi duoc
    // active tai 1 pham vi (vd To truong/Bi thu). null/undefined = khong gioi
    // han so nguoi active tai cung 1 pham vi (vd To pho/Cong tac vien/Can bo
    // UBND/Cong an khu vuc).
    maxActivePerScope?: number | null;
    // Truc doc lap voi maxActivePerScope: gioi han so pham vi MA MOT NGUOI
    // duoc active cung luc voi vai tro nay (vd To pho: khong gioi han so To
    // pho/To dan pho, nhung 1 nguoi chi duoc active To pho o DUY NHAT 1 To dan
    // pho cung luc - xem NeighborhoodColeaderAssignment.ts).
    maxActiveScopesPerUser?: number | null;
    // Chi co y nghia voi vai tro dang "Cong tac vien" (scopeMechanism=ASSIGNED,
    // maxActivePerScope=null): cac kieu pham vi con (hep hon NEIGHBORHOOD) ma
    // vai tro nay duoc phep chon khi gan - xem NEIGHBORHOOD_COLLABORATOR_SCOPES.
    subScopeKinds?: (typeof NEIGHBORHOOD_COLLABORATOR_SCOPES)[number][];
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
        scopeType: {
            type: String,
            enum: ACCESS_SCOPE_TIERS,
            required: true,
            default: "ALL",
        },
        scopeMechanism: {
            type: String,
            enum: SCOPE_ASSIGNMENT_MECHANISMS,
        },
        maxActivePerScope: { type: Number, default: null },
        maxActiveScopesPerUser: { type: Number, default: null },
        subScopeKinds: {
            type: [String],
            enum: NEIGHBORHOOD_COLLABORATOR_SCOPES,
            default: undefined,
        },
        system: { type: Boolean, default: false },
        active: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true },
);

RoleSchema.index({ active: 1, sortOrder: 1, name: 1 });

// Rang buoc giua cac truong scope - khong the bieu dien bang enum/required don
// thuan vi phu thuoc lan nhau (vd maxActivePerScope chi hop le khi
// scopeMechanism="ASSIGNED").
RoleSchema.pre("validate", function (next) {
    const role = this as unknown as IRole;
    if (role.scopeType === "ALL") {
        role.scopeMechanism = undefined;
        role.maxActivePerScope = null;
        role.maxActiveScopesPerUser = null;
        role.subScopeKinds = undefined;
        return next();
    }
    if (!role.scopeMechanism) {
        return next(
            new Error(
                `Vai trò với scopeType="${role.scopeType}" phải chỉ định scopeMechanism`,
            ),
        );
    }
    if (role.scopeMechanism === "OWNED") {
        role.maxActivePerScope = null;
        role.maxActiveScopesPerUser = null;
        role.subScopeKinds = undefined;
    }
    return next();
});

export default (mongoose.models.Role as Model<IRole>) ||
    mongoose.model<IRole>("Role", RoleSchema);
