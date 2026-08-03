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
    importJobId: z.string().min(1, "Thieu ma import job"),
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
