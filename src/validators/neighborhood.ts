import { z } from "zod";
import {
    NEIGHBORHOOD_BOUNDARY_TYPES,
    NEIGHBORHOOD_STATUSES,
} from "@/models/Neighborhood";
import { NEIGHBORHOOD_COLLABORATOR_SCOPES } from "@/models/NeighborhoodCollaboratorAssignment";

const optionalDate = z.coerce.date().optional();
const geometrySchema = z.object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.array(z.unknown()),
});

export const createNeighborhoodSchema = z.object({
    name: z.string().min(1, "Tên tổ dân phố không được để trống"),
    code: z.string().min(1, "Mã tổ dân phố không được để trống"),
    sequence: z.number().int().positive("Số thứ tự phải là số nguyên dương"),
    active: z.boolean().default(true),
    status: z.enum(NEIGHBORHOOD_STATUSES).optional(),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
    // Bat buoc luc tao (moi to dan pho phai thuoc mot phuong/xa) - khong bat
    // buoc o Mongoose/TS vi to dan pho tao truoc khi co truong nay van ton tai
    // (xem models/Neighborhood.ts).
    provinceCode: z.number(),
    provinceName: z.string().min(1, "Vui lòng chọn tỉnh/thành phố"),
    wardCode: z.number(),
    wardName: z.string().min(1, "Vui lòng chọn phường/xã"),
    address: z.string().optional(),
    description: z.string().optional(),
    contactPhone: z.string().optional(),
    notes: z.string().optional(),
    streetIds: z.array(z.string()).default([]),
    alleyDescriptions: z.array(z.string().trim().min(1)).default([]),
    boundaryType: z.enum(NEIGHBORHOOD_BOUNDARY_TYPES).default("NONE"),
    geometry: geometrySchema.optional(),
}).superRefine((value, ctx) => {
    if (
        value.effectiveFrom &&
        value.effectiveTo &&
        value.effectiveTo < value.effectiveFrom
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["effectiveTo"],
            message: "Ngày kết thúc hiệu lực phải sau ngày bắt đầu",
        });
    }
    if (value.boundaryType === "GEOJSON" && !value.geometry) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["geometry"],
            message: "Cần có dữ liệu geometry khi chọn GEOJSON",
        });
    }
});
export type CreateNeighborhoodInput = z.infer<typeof createNeighborhoodSchema>;

// code/sequence la bat bien (immutable) sau khi tao - khong cho sua qua API.
export const updateNeighborhoodSchema = createNeighborhoodSchema
    .innerType()
    .omit({ code: true, sequence: true })
    .partial();
export type UpdateNeighborhoodInput = z.infer<typeof updateNeighborhoodSchema>;

// leaderUserId: null = huy gan (khong can chon nhiem ky, chi go lien ket).
// leaderUserId co gia tri = gan moi, BAT BUOC phai kem termId - to truong
// khong con la mot phan cong "doc lap" voi nhiem ky nua (xem
// neighborhoodService.assignNeighborhoodLeader).
export const assignLeaderSchema = z
    .object({
        leaderUserId: z.string().nullable(),
        note: z.string().optional(),
        termId: z.string().optional(),
        endAt: optionalDate,
    })
    .refine(data => data.leaderUserId === null || !!data.termId, {
        message: "Vui lòng chọn nhiệm kỳ đang áp dụng trước khi phân công tổ trưởng",
        path: ["termId"],
    });
export type AssignLeaderInput = z.infer<typeof assignLeaderSchema>;

// Khac assignLeaderSchema: schema nay CHI dung cho gan moi (huy gan to pho
// dung unassignColeaderSchema rieng ben duoi), nen termId luon bat buoc.
export const assignColeaderSchema = z.object({
    coleaderUserId: z.string(),
    note: z.string().optional(),
    termId: z.string().min(1, "Vui lòng chọn nhiệm kỳ đang áp dụng"),
    endAt: optionalDate,
});
export type AssignColeaderInput = z.infer<typeof assignColeaderSchema>;

export const unassignColeaderSchema = z.object({
    coleaderUserId: z.string(),
});
export type UnassignColeaderInput = z.infer<typeof unassignColeaderSchema>;

// "saveAsDraft" la lua chon giua 2 nut o man tao nhiem ky - KHONG phai
// status truc tiep: true -> luon DRAFT; false/khong gui -> he thong tu tinh
// NOT_STARTED/IN_PROGRESS (hoac ENDED neu ca khoang thoi gian da qua) dua
// theo startAt/endAt, xem resolveTermStatusByDate trong neighborhoodService.ts.
export const createNeighborhoodTermSchema = z
    .object({
        name: z.string().trim().min(1, "Tên nhiệm kỳ là bắt buộc"),
        startAt: z.coerce.date(),
        endAt: z.coerce.date(),
        notes: z.string().trim().optional(),
        saveAsDraft: z.boolean().default(false),
    })
    .refine(value => value.endAt >= value.startAt, {
        path: ["endAt"],
        message: "Ngày kết thúc nhiệm kỳ phải sau ngày bắt đầu",
    });
export type CreateNeighborhoodTermInput = z.infer<
    typeof createNeighborhoodTermSchema
>;

// Chi sua duoc thong tin khi nhiem ky dang DRAFT hoac NOT_STARTED (kiem tra o
// service, khong the bieu dat bang zod don thuan) - cac chuyen trang thai
// (huy/ket thuc/xoa) dung endpoint rieng, KHONG con truong "status" o day nua
// (khac ban cu: cho phep PATCH status tuy y, khong co state machine).
// "finalize": CHI co y nghia khi nhiem ky dang DRAFT - true = luu thong tin
// VA chuyen luon sang NOT_STARTED/IN_PROGRESS (nut "Tạo" khi sua mot ban
// nhap); false/khong gui = chi luu thong tin, van la DRAFT (nut "Lưu nháp").
export const updateNeighborhoodTermSchema = z
    .object({
        name: z.string().trim().min(1).optional(),
        startAt: optionalDate,
        endAt: optionalDate,
        notes: z.string().trim().optional(),
        finalize: z.boolean().optional(),
    });
export type UpdateNeighborhoodTermInput = z.infer<
    typeof updateNeighborhoodTermSchema
>;

export const endNeighborhoodTermEarlySchema = z.object({
    reason: z.string().trim().min(1, "Vui lòng nhập lý do kết thúc sớm"),
});
export type EndNeighborhoodTermEarlyInput = z.infer<
    typeof endNeighborhoodTermEarlySchema
>;

export const assignNeighborhoodCollaboratorSchema = z
    .object({
        collaboratorUserId: z.string(),
        scopeType: z.enum(NEIGHBORHOOD_COLLABORATOR_SCOPES),
        streetId: z.string().optional(),
        houseIds: z.array(z.string()).default([]),
        campaignId: z.string().optional(),
        startAt: z.coerce.date().optional(),
        endAt: optionalDate,
        note: z.string().trim().optional(),
    })
    .superRefine((value, ctx) => {
        if (value.scopeType === "STREET" && !value.streetId) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["streetId"], message: "Cần chọn tuyến đường" });
        }
        if (value.scopeType === "HOUSE_GROUP" && value.houseIds.length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["houseIds"], message: "Cần chọn ít nhất một Nhà số" });
        }
        if (value.scopeType === "CAMPAIGN" && !value.campaignId) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["campaignId"], message: "Cần chọn chiến dịch" });
        }
        if (value.startAt && value.endAt && value.endAt <= value.startAt) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "Ngày kết thúc phải sau ngày bắt đầu" });
        }
    });
export type AssignNeighborhoodCollaboratorInput = z.infer<
    typeof assignNeighborhoodCollaboratorSchema
>;

export const unassignNeighborhoodCollaboratorSchema = z.object({
    assignmentId: z.string(),
});
