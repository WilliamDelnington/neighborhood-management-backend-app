import { z } from "zod";
import {
    HOUSE_RECORD_STATUS,
    HOUSE_PHYSICAL_STATUS,
    HOUSE_USAGE_TYPE,
    ORGANIZATION_TYPE,
} from "@/types";
import { isValidVnPhone } from "@/lib/phone";

// Thong tin mot ca nhan (chu nha hoac nguoi dai dien to chuc) duoc nhan vien
// (to truong) nhap kem luc tao nha so - dung lam input tao tai khoan User
// (resolveOrCreateHouseOwner) HOAC ban ghi Person khai bao khong tai khoan
// (resolveOrCreatePersonOwner), tuy co/khong tick "Tao tai khoan". Khong co
// password: tai khoan tao ra (neu co) chua co mat khau, tu dat/dang nhap sau
// (OTP/Zalo).
const personInfoSchema = z.object({
    displayName: z.string().min(1, "Ten khong duoc de trong"),
    phone: z
        .string()
        .min(1, "Thieu so dien thoai")
        .refine(isValidVnPhone, "So dien thoai khong hop le"),
    email: z
        .string()
        .email("Email khong hop le")
        .optional()
        .or(z.literal("")),
});
export type CreateHouseRecordOwnerInput = z.infer<typeof personInfoSchema>;

// Thong tin to chuc duoc khai bao inline luc tao nha so - neu co taxCode thi
// tim-hoac-tao theo taxCode, khong thi luon tao moi (khong co khoa nao de doi
// chieu trung lap - xem houseRecordService.resolveOrCreateOrganizationOwner).
const organizationInfoSchema = z.object({
    name: z.string().min(1, "Ten to chuc khong duoc de trong"),
    // Khong bat buoc - khong phai to chuc nao cung co ma so thue.
    taxCode: z.string().trim().min(1).optional(),
    organizationType: z.enum(ORGANIZATION_TYPE).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z
        .string()
        .email("Email khong hop le")
        .optional()
        .or(z.literal("")),
});

const houseRecordBaseSchema = z.object({
    // Cluster van la truong client cu gui len; streetId la lua chon moi (Street
    // picker) - it nhat mot trong hai phai co, resolve/dong bo o service layer
    // (xem src/lib/streetSync.ts).
    cluster: z.string().min(1, "Cum dan cu khong duoc de trong").optional(),
    streetId: z.string().min(1).optional(),
    // To dan pho cua chinh nha so nay - khong suy ra tu Street vi mot duong/pho
    // co the chay qua nhieu to dan pho. Optional/nullable, admin gan thu cong.
    neighborhoodId: z.string().nullable().optional(),
    address: z.string().min(1, "Dia chi khong duoc de trong"),
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

export const createHouseRecordSchema = houseRecordBaseSchema.refine(
    data => !!data.cluster || !!data.streetId,
    {
        message: "Vui long chon duong/pho hoac nhap cum dan cu",
        path: ["cluster"],
    },
);
export type CreateHouseRecordInput = z.infer<typeof createHouseRecordSchema>;

export const updateHouseRecordSchema = houseRecordBaseSchema.partial();
export type UpdateHouseRecordInput = z.infer<typeof updateHouseRecordSchema>;

export const updateHouseRecordStatusSchema = z
    .object({
        status: z.enum(HOUSE_RECORD_STATUS),
        note: z.string().optional(),
    })
    .refine(data => data.status !== "denied" || !!data.note?.trim(), {
        message: "Vui long nhap ly do khi tu choi nha so",
        path: ["note"],
    });
export type UpdateHouseRecordStatusInput = z.infer<
    typeof updateHouseRecordStatusSchema
>;
