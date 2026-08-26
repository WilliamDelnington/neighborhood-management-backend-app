import { z } from "zod";

/**
 * Mot dong du lieu da parse tu file Excel, truoc khi duoc chuan hoa thanh
 * document san sang insert vao DB. Dung Record<string, unknown> vi cau truc
 * phu thuoc vao loai import (household/citizen/party_member).
 */
export type ImportPreviewRow = Record<string, unknown>;

/**
 * Input cho step "commit" mot import job. Cac route commit hien tai nhan
 * importJobId tu URL param ([jobId]) nen schema nay chu yeu dung khi can
 * validate body cho mot endpoint commit dung chung trong tuong lai.
 */
export const commitImportSchema = z.object({
    importJobId: z.string().min(1, "Thiếu mã import job"),
});
export type CommitImportInput = z.infer<typeof commitImportSchema>;

/**
 * Mapping cot Excel -> truong du lieu Street, do nguoi dung xac nhan o buoc
 * "chon cot" sau khi upload (xem uploadStreetImportFile/applyStreetImportMapping
 * trong importService.ts). code/active de trong nghia la khong dung cot nao
 * (tu sinh ma / mac dinh dang hoat dong).
 */
export const streetImportMappingSchema = z.object({
    name: z.string().min(1, "Vui lòng chọn cột dữ liệu cho 'Tên đường/phố'"),
    code: z.string().optional(),
    active: z.string().optional(),
});
export type StreetImportMappingInput = z.infer<
    typeof streetImportMappingSchema
>;

/**
 * Mapping cot Excel -> truong du lieu House, do nguoi dung xac nhan o buoc
 * "chon cot" sau khi upload (xem uploadHouseImportFile/applyHouseImportMapping
 * trong importService.ts). Chi "code" bat buoc phai chon cot; cac truong con
 * lai deu tuy chon (bo trong nghia la khong dung cot nao). defaultCluster/
 * neighborhoodId KHONG phai cot trong file - la gia tri admin nhap/chon mot
 * lan cho ca file.
 */
export const houseImportMappingSchema = z.object({
    code: z.string().min(1, "Vui lòng chọn cột dữ liệu cho 'Mã căn/hộ'"),
    subZone: z.string().optional(),
    ownerName: z.string().optional(),
    ownerPhone: z.string().optional(),
    headOfHousehold: z.string().optional(),
    contactPhone: z.string().optional(),
    usageType: z.string().optional(),
    residenceStatus: z.string().optional(),
    hasBusiness: z.string().optional(),
    memberCount: z.string().optional(),
    landStatus: z.string().optional(),
    lotCodeCrossCheck: z.string().optional(),
    note: z.string().optional(),
    defaultCluster: z.string().optional(),
    neighborhoodId: z.string().optional(),
});
export type HouseImportMappingInput = z.infer<
    typeof houseImportMappingSchema
>;
