import { z } from "zod";
import {
    HOUSE_RECORD_STATUS,
    HOUSE_PHYSICAL_STATUS,
    HOUSE_USAGE_TYPE,
    HOUSE_GIS_SOURCES,
    ORGANIZATION_TYPE,
    type HouseGisSource,
} from "@/types";
import { isValidVnPhone } from "@/lib/phone";

// Thong tin mot ca nhan (chu nha hoac nguoi dai dien to chuc) duoc nhan vien
// (to truong) nhap kem luc tao nha so - dung lam input tao tai khoan User
// (resolveOrCreateHouseOwner) HOAC ban ghi Person khai bao khong tai khoan
// (resolveOrCreatePersonOwner), tuy co/khong tick "Tao tai khoan".
// password: TAM THOI cho phep nhan vien dat mat khau luc tao (thay vi bat
// buoc OTP/Zalo, hien chua san sang do can duyet mau tin truoc - xem
// LoginPage.tsx) - chi dung khi tao tai khoan MOI (khong ghi de mat khau tai
// khoan da ton tai, xem houseRecordService.resolveOrCreateHouseOwner).
const personInfoSchema = z.object({
    displayName: z.string().min(1, "Tên không được để trống"),
    phone: z
        .string()
        .min(1, "Thiếu số điện thoại")
        .refine(isValidVnPhone, "Số điện thoại không hợp lệ"),
    email: z
        .string()
        .email("Email không hợp lệ")
        .optional()
        .or(z.literal("")),
    password: z
        .string()
        .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
        .optional(),
});
export type CreateHouseRecordOwnerInput = z.infer<typeof personInfoSchema>;

// Thong tin to chuc duoc khai bao inline luc tao nha so - neu co taxCode thi
// tim-hoac-tao theo taxCode, khong thi luon tao moi (khong co khoa nao de doi
// chieu trung lap - xem houseRecordService.resolveOrCreateOrganizationOwner).
const organizationInfoSchema = z.object({
    name: z.string().min(1, "Tên tổ chức không được để trống"),
    // Khong bat buoc - khong phai to chuc nao cung co ma so thue.
    taxCode: z.string().trim().min(1).optional(),
    organizationType: z.enum(ORGANIZATION_TYPE).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z
        .string()
        .email("Email không hợp lệ")
        .optional()
        .or(z.literal("")),
});

const houseRecordBaseSchema = z.object({
    // Cluster van la truong client cu gui len; streetId la lua chon moi (Street
    // picker) - it nhat mot trong hai phai co, resolve/dong bo o service layer
    // (xem src/lib/streetSync.ts).
    cluster: z.string().min(1, "Cụm dân cư không được để trống").optional(),
    streetId: z.string().min(1).optional(),
    // To dan pho cua chinh nha so nay - khong suy ra tu Street vi mot duong/pho
    // co the chay qua nhieu to dan pho. Optional/nullable, admin gan thu cong.
    neighborhoodId: z.string().nullable().optional(),
    address: z.string().min(1, "Địa chỉ không được để trống"),
    // Phuong/xa va tinh/thanh pho - hien thi dia chi day du, khong bat buoc va
    // khong gan voi bat ky rang buoc/pham vi nao (xem lib/administrativeDivisions.ts).
    provinceCode: z.number().optional(),
    provinceName: z.string().optional(),
    wardCode: z.number().optional(),
    wardName: z.string().optional(),
    // Tinh trang cong trinh thuc te - doc lap voi status ho so (xem
    // HOUSE_PHYSICAL_STATUS o types/index.ts). Chu nha/nhan vien co the cap
    // nhat bat cu luc nao, khong gan voi luong duyet/tu choi.
    physicalStatus: z.enum(HOUSE_PHYSICAL_STATUS).optional(),
    // Muc dich su dung nha do chu nha tu khai bao - xem models/HouseRecord.ts.
    usageTypes: z.array(z.enum(HOUSE_USAGE_TYPE)).optional(),
    otherUsageNote: z.string().optional(),
    note: z.string().optional(),
    residenceDeclarationNumber: z.string().optional(),
    // Cho phep null/0 de tuong thich client va du lieu nhap tam thoi. Service
    // se chuan hoa 0/0 (hoac null) thanh "chua co GIS", khong tao GeoJSON.
    gisLatitude: z.number().min(-90).max(90).nullable().optional(),
    gisLongitude: z.number().min(-180).max(180).nullable().optional(),
    gisAccuracyMeters: z.number().min(0).nullable().optional(),
    gisSource: z.enum(HOUSE_GIS_SOURCES).optional(),
    gisCapturedAt: z.string().datetime().nullable().optional(),
    // Bat buoc = true khi gisSource la "address_lookup"/"device_gps" (du lieu
    // vi tri nhay cam theo Luat BVDLCN so 91/2025/QH15) - xem
    // requiresGeoConsent ben duoi va houseRecordService (ghi vao audit log).
    geoConsentAccepted: z.boolean().optional(),
    // Loai chu nha duoc khai bao luc tao nha so - "none" = chua biet/chua
    // khai bao (hanh vi cu khi khong nhap gi ca). Chi co y nghia luc tao moi -
    // xem houseRecordService.createHouseRecord.
    ownerKind: z.enum(["individual", "organization", "none"]).default("none"),
    // ownerKind="individual": thong tin chu nha ca nhan, luon duoc thu thap du
    // co tao tai khoan hay khong (xem createOwnerAccount).
    owner: personInfoSchema.optional(),
    // true = tao tai khoan User dang nhap duoc cho chu nha (hanh vi cu); false
    // = chi luu lai thanh Person (khai bao, khong dang nhap duoc).
    createOwnerAccount: z.boolean().optional(),
    // ownerKind="organization": thong tin to chuc, luon duoc thu thap.
    organization: organizationInfoSchema.optional(),
    // true = tao them tai khoan User cho nguoi dai dien to chuc (chi ap dung
    // khi to chuc duoc TAO MOI trong lan goi nay - xem
    // resolveOrCreateOrganizationOwner); false/khong co = to chuc chua co
    // nguoi dai dien dang nhap duoc.
    createRepresentativeAccount: z.boolean().optional(),
    representative: personInfoSchema.optional(),
});

// gisSource nhay cam ("address_lookup"/"device_gps" - vi tri xac dinh qua dich
// vu dinh vi, thuoc du lieu ca nhan nhay cam theo Dieu 2 Luat BVDLCN so
// 91/2025/QH15) bat buoc phai co geoConsentAccepted=true kem theo - day la lop
// chan phia server, KHONG chi dua vao checkbox phia client (xem HouseLocationPicker
// o frontend). CHI ap dung cho create/updateHouseRecordSchema (chu nha tu khai
// bao qua Mini App/resident-web-app) - KHONG ap dung cho
// updateHouseRecordGisSchema (endpoint /gis danh rieng cho nhan vien/can bo
// thuc dia chinh sua tai cho qua HouseGisPanel.tsx o admin-web-app, khong phai
// luong tu khai bao cua chu nha nen khong can xin dong y lai).
function requiresGeoConsent(data: {
    gisSource?: HouseGisSource;
    geoConsentAccepted?: boolean;
}): boolean {
    return (
        (data.gisSource !== "address_lookup" &&
            data.gisSource !== "device_gps") ||
        data.geoConsentAccepted === true
    );
}
const GEO_CONSENT_ISSUE = {
    message:
        "Can xac nhan dong y thu thap vi tri (du lieu nhay cam) truoc khi luu toa do tu dia chi/GPS",
    path: ["geoConsentAccepted"],
};

export const createHouseRecordSchema = houseRecordBaseSchema.refine(
    data => !!data.cluster || !!data.streetId,
    {
        message: "Vui lòng chọn đường/phố hoặc nhập cụm dân cư",
        path: ["cluster"],
    })
    .refine(requiresGeoConsent, GEO_CONSENT_ISSUE);
export type CreateHouseRecordInput = z.infer<typeof createHouseRecordSchema>;

export const updateHouseRecordSchema = houseRecordBaseSchema
    .partial()
    .refine(requiresGeoConsent, GEO_CONSENT_ISSUE);
export type UpdateHouseRecordInput = z.infer<typeof updateHouseRecordSchema>;

export const updateHouseRecordGisSchema = z.object({
    gisLatitude: z.number().min(-90).max(90).nullable(),
    gisLongitude: z.number().min(-180).max(180).nullable(),
    gisAccuracyMeters: z.number().min(0).nullable().optional(),
    gisSource: z.enum(HOUSE_GIS_SOURCES).default("device_gps"),
    gisCapturedAt: z.string().datetime().nullable().optional(),
});
export type UpdateHouseRecordGisInput = z.infer<
    typeof updateHouseRecordGisSchema
>;

export const updateHouseRecordStatusSchema = z
    .object({
        status: z.enum(HOUSE_RECORD_STATUS),
        note: z.string().optional(),
    })
    .refine(data => data.status !== "denied" || !!data.note?.trim(), {
        message: "Vui lòng nhập lý do khi từ chối nhà số",
        path: ["note"],
    })
    .refine(
        data => data.status !== "needs_update" || !!data.note?.trim(),
        {
            message: "Vui lòng nhập chi tiết cần cập nhật",
            path: ["note"],
        },
    );
export type UpdateHouseRecordStatusInput = z.infer<
    typeof updateHouseRecordStatusSchema
>;

const bulkHouseIdsSchema = {
    ids: z
        .array(z.string().min(1))
        .min(1, "Vui lòng chọn ít nhất một nhà số"),
};

// Gan mot to dan pho cho nhieu nha so cung luc (vd nha nhap tu Excel con
// thieu to dan pho) - xem houseRecordService.bulkAssignHouseNeighborhood.
// Nha da "verified" se bi tu choi RIENG cho tung nha (khong lam dung ca lo),
// giong quy tac cua updateHouseRecordSchema.
export const bulkAssignHouseNeighborhoodSchema = z.object({
    ...bulkHouseIdsSchema,
    neighborhoodId: z.string().min(1, "Vui lòng chọn tổ dân phố"),
});
export type BulkAssignHouseNeighborhoodInput = z.infer<
    typeof bulkAssignHouseNeighborhoodSchema
>;

// Duyet/tu choi hang loat (vd cac nha dang "Chờ duyệt") - cung quy tac voi
// updateHouseRecordStatusSchema (ly do bat buoc khi tu choi/yeu cau cap nhat).
export const bulkUpdateHouseRecordStatusSchema = z
    .object({
        ...bulkHouseIdsSchema,
        status: z.enum(HOUSE_RECORD_STATUS),
        note: z.string().optional(),
    })
    .refine(data => data.status !== "denied" || !!data.note?.trim(), {
        message: "Vui lòng nhập lý do khi từ chối nhà số",
        path: ["note"],
    })
    .refine(
        data => data.status !== "needs_update" || !!data.note?.trim(),
        {
            message: "Vui lòng nhập chi tiết cần cập nhật",
            path: ["note"],
        },
    );
export type BulkUpdateHouseRecordStatusInput = z.infer<
    typeof bulkUpdateHouseRecordStatusSchema
>;
