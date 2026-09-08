import mongoose, { Schema, type Document, type Model } from "mongoose";
import { NEIGHBORHOOD_COLLABORATOR_SCOPES } from "./NeighborhoodCollaboratorAssignment";

// Ban ghi gan mot vai tro "dia ly" (WARD/NEIGHBORHOOD, xem Role.scopeType) cho
// mot User tai mot pham vi cu the - thay the User.wardCode-nhu-gan-truc-tiep va
// 3 bang NeighborhoodLeaderAssignment/NeighborhoodColeaderAssignment/
// NeighborhoodCollaboratorAssignment rieng le truoc day. KHONG lien quan den
// model RoleAssignment (models/RoleAssignment.ts) - do la nhat ky cap vai tro
// (audit-only, scopeType/scopeValues o do chi la snapshot tai thoi diem cap,
// khong ai doc lai de tinh quyen truy cap - xem types/index.ts). Model nay MOI
// la nguon du lieu thuc su duoc doc de tinh pham vi (xem rbac.resolveScopeFilter).
//
// Khong bao gio xoa ban ghi - chi dong (unassignedAt/unassignedBy) de giu lich
// su day du (vd danh sach To truong/Bi thu qua cac thoi ky), giong cach 3 bang
// cu da hoat dong truoc day.
export interface IScopeAssignment extends Document {
    userId: mongoose.Types.ObjectId;
    roleKey: string;
    scopeType: "WARD" | "NEIGHBORHOOD";
    // wardCode (number, xem User.wardCode) khi scopeType="WARD"; Neighborhood
    // _id khi scopeType="NEIGHBORHOOD". La Mixed vi 2 kieu scopeId khac nhau
    // (Number vs ObjectId) tuy scopeType.
    scopeId: mongoose.Schema.Types.Mixed;
    subScope?: {
        kind: (typeof NEIGHBORHOOD_COLLABORATOR_SCOPES)[number];
        streetId?: mongoose.Types.ObjectId;
        houseIds?: mongoose.Types.ObjectId[];
        campaignId?: mongoose.Types.ObjectId;
    };
    assignedAt: Date;
    assignedBy: mongoose.Types.ObjectId;
    unassignedAt?: Date;
    unassignedBy?: mongoose.Types.ObjectId;
    note?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ScopeAssignmentSchema = new Schema<IScopeAssignment>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        roleKey: { type: String, required: true, index: true },
        scopeType: {
            type: String,
            enum: ["WARD", "NEIGHBORHOOD"],
            required: true,
        },
        scopeId: { type: Schema.Types.Mixed, required: true },
        subScope: {
            kind: { type: String, enum: NEIGHBORHOOD_COLLABORATOR_SCOPES },
            streetId: { type: Schema.Types.ObjectId, ref: "Street" },
            houseIds: [{ type: Schema.Types.ObjectId, ref: "HouseRecord" }],
            campaignId: {
                type: Schema.Types.ObjectId,
                ref: "InspectionCampaign",
            },
        },
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        unassignedAt: { type: Date },
        unassignedBy: { type: Schema.Types.ObjectId, ref: "User" },
        note: { type: String, trim: true },
    },
    { timestamps: true },
);

// Tra cuu theo nguoi giu (vd "danh sach pham vi dang active cua user X").
ScopeAssignmentSchema.index({ userId: 1, roleKey: 1, unassignedAt: 1 });
// Tra cuu theo pham vi (vd "ai dang active tai To dan pho Y voi vai tro Z") -
// dung boi ca resolver scope va logic kiem tra maxActivePerScope khi gan moi.
ScopeAssignmentSchema.index({
    scopeType: 1,
    scopeId: 1,
    roleKey: 1,
    unassignedAt: 1,
});
// Phong thu 2 lop (defense-in-depth) cho cac vai tro co maxActivePerScope=1 DA
// BIET truoc (vd neighborhood_leader, secretary) - Mongo partial index khong
// the tham chieu Role.maxActivePerScope (khac collection) nen day KHONG phai
// co che thuc thi chinh; thuc thi thuc su nam o scopeAssignmentService.assignScope
// (doc Role.maxActivePerScope truc tiep, phan anh dung cau hinh moi nhat).
ScopeAssignmentSchema.index(
    { roleKey: 1, scopeType: 1, scopeId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            unassignedAt: { $exists: false },
            roleKey: { $in: ["neighborhood_leader", "secretary"] },
        },
    },
);

export default (mongoose.models.ScopeAssignment as Model<IScopeAssignment>) ||
    mongoose.model<IScopeAssignment>("ScopeAssignment", ScopeAssignmentSchema);
