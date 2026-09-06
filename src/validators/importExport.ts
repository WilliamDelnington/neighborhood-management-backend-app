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
    // KHONG phai cot trong file - co/khong tick chon MOT LAN cho ca file (xem
    // applyHouseImportMapping/commitHouseImport). Khi bat, moi dong CO chu ho
    // (headOfHousehold hoac ownerName) se duoc tao them mot Household lien ket
    // qua houseId, ben canh House nhu truoc - mac dinh TAT de khong doi hanh
    // vi cua cac file nhap chi co du lieu nha (khong co thong tin ho dan).
    createHouseholds: z.boolean().optional(),
    // KHONG phai cot trong file - admin nhap MOT LAN cho ca file (xem
    // applyHouseImportMapping/commitHouseImport). Khi co, moi tai khoan chu
    // nha MOI duoc tao trong lan import nay (dong co ca ten + SDT chu so
    // huu hop le) se duoc dat mat khau nay, VA bat buoc doi mat khau ngay
    // lan dang nhap dau tien (xem User.mustChangePassword) - vi mat khau
    // giong het nhau cho nhieu tai khoan la rui ro tam thoi, chap nhan duoc
    // trong thoi gian ngan cho toi khi tung chu nha tu doi.
    defaultPassword: z.string().min(6, "Mật khẩu mặc định phải có ít nhất 6 ký tự").optional(),
});
export type HouseImportMappingInput = z.infer<
    typeof houseImportMappingSchema
>;

/**
 * Mapping cot Excel -> truong du lieu Business (ho kinh doanh), do nguoi dung
 * xac nhan o buoc "chon cot" sau khi upload (xem uploadBusinessImportFile/
 * applyBusinessImportMapping trong importService.ts). "name" va "houseCode"
 * bat buoc phai chon cot - khac House import (tao nha moi tu file), Business
 * import CHI gan vao nha da ton tai san trong he thong (doi chieu qua
 * houseCode voi HouseRecord.code), khong tu tao nha moi.
 */
export const businessImportMappingSchema = z.object({
    name: z.string().min(1, "Vui lòng chọn cột dữ liệu cho 'Tên hộ kinh doanh'"),
    houseCode: z.string().min(1, "Vui lòng chọn cột dữ liệu cho 'Mã nhà'"),
    businessTypeName: z.string().optional(),
    ownerName: z.string().optional(),
    taxCode: z.string().optional(),
    phone: z.string().optional(),
    active: z.string().optional(),
    note: z.string().optional(),
});
export type BusinessImportMappingInput = z.infer<
    typeof businessImportMappingSchema
>;

/**
 * Mapping cot Excel -> truong du lieu Citizen (nhan khau), do nguoi dung xac
 * nhan o buoc "chon cot" sau khi upload (xem uploadCitizenImportFile/
 * applyCitizenImportMapping trong importService.ts) - khac ban dau (bo nhan
 * cot CO DINH), gio dung chung mau "chon cot" voi House/Business/Street de
 * chap nhan file voi ten cot bat ky.
 *
 * "fullName" bat buoc phai chon cot. Rieng cot lien ket toi ho dan, chap
 * nhan MOT TRONG HAI (hoac ca hai, uu tien householdCode neu o mot dong co
 * gia tri o ca hai cot):
 * - "householdCode" ("Mã hộ"): khop truc tiep voi Household.code da co san.
 * - "houseCode" ("Mã căn/hộ"): khop voi HouseRecord.code, sau do he thong tu
 *   tim Household dang lien ket voi nha do (houseId) - dung cho file chi ghi
 *   ma nha (khong co ma ho rieng), vd cac phieu thu thap dan cu chuan.
 */
export const citizenImportMappingSchema = z
    .object({
        fullName: z.string().min(1, "Vui lòng chọn cột dữ liệu cho 'Họ tên'"),
        phone: z.string().optional(),
        cccd: z.string().optional(),
        birthDate: z.string().optional(),
        gender: z.string().optional(),
        relationToHead: z.string().optional(),
        householdCode: z.string().optional(),
        houseCode: z.string().optional(),
        residenceType: z.string().optional(),
        isElderly: z.string().optional(),
        isChild: z.string().optional(),
        isDisabledOrSupportNeeded: z.string().optional(),
        isPartyMember: z.string().optional(),
        isUnionMember: z.string().optional(),
    })
    .refine(data => !!data.householdCode || !!data.houseCode, {
        message:
            "Vui lòng chọn cột 'Mã hộ' hoặc 'Mã căn/hộ' để liên kết nhân khẩu với hộ dân",
        path: ["householdCode"],
    });
export type CitizenImportMappingInput = z.infer<
    typeof citizenImportMappingSchema
>;
