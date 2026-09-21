import { z } from "zod";
import { isValidPermissionKey } from "@/lib/permissionRegistry";
import { ACCESS_SCOPE_TIERS, SCOPE_ASSIGNMENT_MECHANISMS } from "@/models/Role";
import { NEIGHBORHOOD_COLLABORATOR_SCOPES } from "@/models/NeighborhoodCollaboratorAssignment";
import { DASHBOARD_METRIC_KEYS } from "@/types";

const permissionsField = z
    .array(z.string())
    .default([])
    .refine(
        permissions => permissions.every(isValidPermissionKey),
        "Danh sách permission chứa key không hợp lệ",
    );

// Khac truong duoi: danh muc so lieu dashboard la CO DINH (khong co collection
// quan tri duoc tuong ung nhu ComplaintTypeDefinition/RequestTypeDefinition),
// nen dung thang z.enum thay vi regex-string long leo.
const dashboardMetricsField = z.array(z.enum(DASHBOARD_METRIC_KEYS));
// Danh sach role key duoc phep chon khi "Tạo tài khoản" (xem
// userService.getCreatableRolesForActor) - khac truong tren, KHONG dung quy
// uoc undefined/null = khong gioi han vi day la quyen nhay cam, nen luon la
// mang (mac dinh rong).
const creatableRolesField = z.array(
    z.string().regex(/^[a-z][a-z0-9_]*$/, "Vai trò không hợp lệ"),
);

// Pham vi du lieu vai tro nay quan ly - xem Role.ts de biet y nghia tung
// truong va rang buoc phu thuoc lan nhau (kiem lai o Mongoose pre("validate"),
// o day chi kiem hinh dang co ban).
const scopeFields = {
    // Mac dinh "ALL" (giong Role.ts) thay vi bat buoc - de khong pha vo man
    // "Tạo vai trò tùy chỉnh" hien tai (chua co UI chon scope) cho den khi UI
    // duoc cap nhat o Phase 2; admin co the sua lai sau qua man Quan ly vai tro.
    scopeType: z.enum(ACCESS_SCOPE_TIERS).default("ALL"),
    scopeMechanism: z.enum(SCOPE_ASSIGNMENT_MECHANISMS).optional(),
    subScopeKinds: z.array(z.enum(NEIGHBORHOOD_COLLABORATOR_SCOPES)).optional(),
};

export const createRoleSchema = z.object({
    key: z
        .string()
        .min(2, "Key quá ngắn")
        .regex(
            /^[a-z][a-z0-9_]*$/,
            "Key chỉ gồm chữ thường, số và gạch dưới, bắt đầu bằng chữ",
        ),
    name: z.string().min(1, "Thiếu tên vai trò"),
    description: z.string().optional(),
    permissions: permissionsField,
    // Bo trong = khong gioi han (giu nguyen bo so lieu dashboard co dinh theo
    // audience nhu truoc day - xem dashboardService.ts).
    dashboardMetrics: dashboardMetricsField.optional(),
    // Bo trong = KHONG duoc tao vai tro nao ngoai house_owner (mac dinh an
    // toan, khac 2 truong tren) - xem ghi chu o Role.ts.
    allowedCreatableRoles: creatableRolesField.default([]),
    active: z.boolean().default(true),
    sortOrder: z.number().default(0),
    ...scopeFields,
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
    name: z.string().min(1, "Thiếu tên vai trò").optional(),
    description: z.string().optional(),
    permissions: permissionsField.optional(),
    dashboardMetrics: dashboardMetricsField.nullable().optional(),
    // undefined = khong doi, mang (ke ca rong) = thay the toan bo danh sach -
    // khong co gia tri null o day (xem ghi chu creatableRolesField).
    allowedCreatableRoles: creatableRolesField.optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().optional(),
    ...scopeFields,
    // scopeType bat buoc o createRoleSchema (scopeFields.scopeType) nhung o day
    // phai la optional - cap nhat mot vai tro khong nhat thiet doi pham vi.
    scopeType: scopeFields.scopeType.optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
