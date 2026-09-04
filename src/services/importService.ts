import ExcelJS from "exceljs";
import {
    Household,
    Citizen,
    Street,
    HouseRecord,
    Business,
    BusinessType,
    ImportJob,
    type IImportJob,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateSequentialCode } from "@/lib/utils";
import { generateStreetCode } from "@/lib/streetSync";
import { isValidVnPhone } from "@/lib/phone";
import { writeAuditLog } from "@/services/auditService";
import {
    createHouseRecord,
    resolveInitialVerificationStatus,
    assertHouseRecordInScope,
} from "@/services/houseRecordService";
import { createBusiness } from "@/services/businessService";
import {
    GIOI_TINH,
    LOAI_CU_TRU,
    type GioiTinh,
    type LoaiCuTru,
    type LoaiSoHuu,
} from "@/types";

// ---------------------------------------------------------------------------
// Dinh dang cot Excel mong doi (hang dau tien cua sheet dau tien la header).
//
// Import nha so:
//   Giong Import duong/pho o duoi - upload TRUOC (header co the la bat ky ten
//   cot nao), nguoi dung CHON COT tuong ung o buoc sau (xem
//   applyHouseImportMapping), vi cac file thu thap thuc te tu nhieu to dan
//   pho khac nhau thuong khong dung chung mot bo nhan cot. HOUSE_COLUMNS o
//   duoi chi con dung de: (1) goi y mapping ban dau khi nhan cot khop san
//   (giong SUGGESTED_MAPPING cua Street), (2) hien thi nhan tieng Viet de
//   nguoi dung chon trong UI.
//   - "Mã căn/hộ" la cot BAT BUOC phai chon, va gia tri duoc dung Y NGUYEN
//     lam House.code (KHONG tu sinh qua generateSequentialCode nhu luong tao
//     nha so binh thuong tren UI) - vi mot so dia ban da co san ma nha rieng
//     (vd "H01-L19") tu truoc khi dung he thong nay, khong theo dinh dang
//     tuan tu NSxxx.
//   - Neu ma DA TON TAI trong he thong (vd import lai mot file da cap nhat
//     them thong tin, giong cach du lieu thuc te duoc gop qua nhieu "đợt thu
//     thập") - KHONG bao loi va KHONG tao trung, ma duoc coi la mot lan "cap
//     nhat": CHI dien vao truong dang TRONG tren House da co (hien tai: note,
//     neighborhoodId), khong bao gio ghi de gia tri da co san (xem
//     mergeIntoExistingHouse). CHI ap dung khi nha van con
//     "unverified"/"pending" - nha da "verified" bi khoa boi
//     HOUSE_RECORD_PROTECTED_FIELDS (phai qua ChangeRequest de sua), nen dong
//     nay se khong sua gi ca (van tinh la thanh cong, chi khong co gi thay
//     doi). KHONG tu gan/doi chu nha cho nha da ton tai du dong co "Chủ sở
//     hữu đứng tên" hop le - gan chu nha la hanh dong rieng, phai lam thu
//     cong qua man chi tiet nha.
//   - "Phân khu/dãy" (neu co chon cot) duoc dung lam cluster (cum dan cu)
//     cua dong do; neu cot nay khong duoc chon HOAC o rong, dung "cum mac
//     dinh cho ca file" nguoi dung nhap luc chon cot (xem
//     HouseColumnMapping.defaultCluster). Neu ca hai deu trong, dong bi bao
//     loi (House bat buoc phai co cluster hoac streetId).
//   - "Chủ sở hữu đứng tên" + "SĐT chủ sở hữu" (neu co chon ca hai cot): CHI
//     tao tai khoan chu nha (User, role house_owner) khi CA HAI co gia tri
//     hop le (ten khong rong, SDT dung dinh dang VN qua isValidVnPhone) -
//     thieu mot trong hai (hoac khong chon cot) thi nha van duoc tao, chi la
//     chua co chu nha (giong ownerKind="none"). SDT khong hop le KHONG chan
//     ca dong - chi bo qua viec tao tai khoan. KHONG co cot CCCD/CMND -
//     truong nay khong bat buoc cho tai khoan chu nha tao qua luong nay (xem
//     resolveOrCreateHouseOwner).
//   - Cac cot con lai (Chủ hộ/người đang sử dụng, SĐT/Zalo liên hệ, Loại hình
//     sử dụng, Tình trạng cư trú, Có kinh doanh, Số nhân khẩu, Trạng thái đất,
//     Đối chiếu mã lô, Ghi chú) la TUY CHON - neu co chon cot, gia tri duoc
//     gop lai thanh MOT doan ghi chu duy nhat luu vao House.note (xem
//     buildHouseImportNote) de khong mat du lieu.
//   - "createHouseholds" (KHONG phai cot - tick chon MOT LAN cho ca file):
//     khi bat, MOI dong CO ten chu ho (tu cot "Chủ hộ/người đang sử dụng",
//     hoac "Chủ sở hữu đứng tên" neu cot truoc trong/khong chon) se duoc tao
//     THEM mot Household lien ket qua houseId - mac dinh TAT (giu nguyen hanh
//     vi cu: CHI tao House + tai khoan chu nha, khong tao Household) vi
//     khong phai file nao cung mang du lieu ho dan that su. "Loại hình sử
//     dụng" chua "kinh doanh" (hoac "Có kinh doanh"="Có") KHONG chan viec tao
//     Household - mot dia chi co the vua o vua kinh doanh - chi duoc ghi
//     thanh mot dong note tren Household de admin biet can bo sung Hộ kinh
//     doanh rieng (he thong khong tu suy ra du du lieu ten/MST cho Business
//     tu sheet nay). memberCount cua Household tao ra bat dau tu 0, duoc dien
//     dan qua import nhan khau (xem duoi) - KHONG lay tu cot "Số nhân khẩu"
//     de tranh dem trung. Neu nha (moi hoac da ton tai) da co san DUNG 1
//     Household, KHONG tao them ban thu hai - ap dung cung nguyen tac "chi
//     dien vao truong dang trong" nhu House o tren (phone/note), va cung chi
//     ap dung khi Household do con "unverified"/"pending". Neu nha co nhieu
//     hon 1 Household (hiem, tao thu cong) thi bo qua, khong ro nen dien vao
//     Household nao.
//
// Import ho dan:
//   Cụm dân cư | Địa chỉ | Chủ hộ | Số điện thoại | Loại sở hữu | Cần hỗ trợ
//   | Ghi chú
//   - "Loại sở hữu" chap nhan "Chính chủ" / "Cho thuê" (khong phan biet hoa/thuong,
//     co the go co dau hoac khong dau, vd "chinh chu" cung hop le).
//   - "Cần hỗ trợ" chap nhan "Có"/"Không" hoac true/false/1/0, mac dinh Khong.
//   - Khong co cot "so nhan khau": memberCount do he thong tu tinh dua tren so
//     Citizen thuc te thuoc ho dan, duoc dien khi import nhan khau (xem duoi).
//
// Import nhan khau:
//   Giong Import nha so/Business - upload TRUOC, chon cot o buoc sau (xem
//   applyCitizenImportMapping). Chi "Họ tên" bat buoc; rieng cot lien ket toi
//   ho dan chap nhan MOT TRONG HAI (uu tien "Mã hộ" cho tung dong neu co gia
//   tri o ca hai):
//   - "Mã hộ": khop truc tiep Household.code da co san (vd HB001).
//   - "Mã căn/hộ": khop HouseRecord.code, roi tu tim Household DANG lien ket
//     voi nha do (qua houseId) - dung cho cac file chi ghi ma nha (khong co
//     ma ho rieng, vd phieu thu thap dan cu chuan) - loi neu nha chua co
//     Household nao (xem tuy chon "createHouseholds" cua Import nha so o
//     tren) hoac co nhieu hon 1 Household (truong hop nay phai dung "Mã hộ"
//     de xac dinh chinh xac).
//
// Import duong/pho:
//   Tên đường/phố | Mã đường/phố | Trạng thái
//   - "Mã đường/phố" khong bat buoc: neu de trong, ma duoc tu sinh tu ten
//     (giong cach Street duoc tu tao khi mot Household/House dung cluster tu
//     do chua tung ton tai - xem lib/streetSync.ts generateStreetCode). Neu co
//     nhap, ma phai duy nhat (ca trong file va trong he thong).
//   - "Trạng thái" chap nhan Đang hoạt động/Ngừng hoạt động hoac true/false/
//     có/không, mac dinh dang hoat dong (giong quy uoc "Cần hỗ trợ" o tren).
//   - Cac cot khac ngoai 3 cot tren trong file Excel (vd ghi chu tu do) KHONG
//     duoc doc/luu - chi 3 cot duoc khai bao trong STREET_COLUMNS moi anh
//     huong den du lieu import.
//
// Import ho kinh doanh:
//   Giong Import nha so - upload TRUOC, chon cot o buoc sau (xem
//   applyBusinessImportMapping). "Tên hộ kinh doanh" va "Mã nhà" la hai cot
//   BAT BUOC:
//   - "Mã nhà" phai khop voi HouseRecord.code CUA MOT NHA DA TON TAI trong he
//     thong (KHAC House import - Business import khong tu tao nha moi, chi
//     gan ho kinh doanh vao nha co san).
//   - "Loại hình kinh doanh" (neu co chon cot va co gia tri): doi chieu ten
//     (khong phan biet hoa/thuong/dau) voi BusinessType da co - khong khop thi
//     dong bi bao loi (giong quy uoc "Loại sở hữu" cua Household import),
//     tranh am tham gan sai loai hinh.
//   - "Mã số thuế" tuy chon, nhung neu co gia tri thi phai duy nhat (ca trong
//     file va trong he thong) - giong rang buoc unique cua Business.taxCode.
//   - Moi dong duoc tao qua businessService.createBusiness (khong insert
//     truc tiep bang Model) de tai su dung nguyen ven logic denormalize
//     cluster/streetId/neighborhoodId tu nha, tinh trang thai xac thuc ban dau,
//     va ghi audit log - giong cach commitHouseImport tai su dung
//     createHouseRecord.
// ---------------------------------------------------------------------------

const HOUSE_COLUMNS = {
    code: "Mã căn/hộ",
    subZone: "Phân khu/dãy",
    ownerName: "Chủ sở hữu đứng tên",
    ownerPhone: "SĐT chủ sở hữu",
    headOfHousehold: "Chủ hộ/người đang sử dụng",
    contactPhone: "SĐT/Zalo liên hệ",
    usageType: "Loại hình sử dụng",
    residenceStatus: "Tình trạng cư trú",
    hasBusiness: "Có kinh doanh",
    memberCount: "Số nhân khẩu",
    landStatus: "Trạng thái đất",
    lotCodeCrossCheck: "Đối chiếu mã lô",
    note: "Ghi chú",
} as const;

const HOUSEHOLD_COLUMNS = {
    cluster: "Cụm dân cư",
    address: "Địa chỉ",
    headOfHousehold: "Chủ hộ",
    phone: "Số điện thoại",
    ownershipType: "Loại sở hữu",
    needsSupport: "Cần hỗ trợ",
    note: "Ghi chú",
} as const;

const CITIZEN_COLUMNS = {
    fullName: "Họ tên",
    phone: "Số điện thoại",
    cccd: "CCCD",
    birthDate: "Ngày sinh",
    gender: "Giới tính",
    relationToHead: "Quan hệ với chủ hộ",
    householdCode: "Mã hộ",
    // Cot lien ket THAY THE cho householdCode - xem ghi chu "Import nhan
    // khau" o dau file va applyCitizenImportMapping.
    houseCode: "Mã căn/hộ",
    residenceType: "Thường trú/Tạm trú",
    isElderly: "Người cao tuổi",
    isChild: "Trẻ em",
    isDisabledOrSupportNeeded: "Người khuyết tật",
    isPartyMember: "Đảng viên",
    isUnionMember: "Đoàn viên",
} as const;

const STREET_COLUMNS = {
    name: "Tên đường/phố",
    code: "Mã đường/phố",
    active: "Trạng thái",
} as const;

const BUSINESS_COLUMNS = {
    name: "Tên hộ kinh doanh",
    houseCode: "Mã nhà",
    businessTypeName: "Loại hình kinh doanh",
    ownerName: "Chủ hộ kinh doanh",
    taxCode: "Mã số thuế",
    phone: "Số điện thoại",
    active: "Trạng thái",
    note: "Ghi chú",
} as const;

// ---------------------------------------------------------------------------
// Helpers doc file Excel
// ---------------------------------------------------------------------------

type WorksheetRow = { rowNumber: number; values: Record<string, unknown> };

async function readWorksheetRows(
    fileBuffer: Buffer,
): Promise<{ headers: string[]; rows: WorksheetRow[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new HttpError("File Excel không có sheet dữ liệu nào", 400);
    }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        headers[colNumber] = cellToString(cell.value).trim();
    });

    if (headers.filter(Boolean).length === 0) {
        throw new HttpError(
            "Không đọc được dòng tiêu đề (header) trong file Excel",
            400,
        );
    }

    const rows: WorksheetRow[] = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        if (row.actualCellCount === 0) return;

        const values: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const header = headers[colNumber];
            if (header) values[header] = cell.value;
        });
        rows.push({ rowNumber, values });
    });

    return { headers: headers.filter(Boolean), rows };
}

function cellToString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
        const v = value as Record<string, unknown>;
        if (typeof v.text === "string") return v.text;
        if (Array.isArray(v.richText)) {
            return (v.richText as { text: string }[]).map(t => t.text).join("");
        }
        if (v.result !== undefined) return String(v.result);
    }
    return String(value);
}

const COMBINING_DIACRITICS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

function stripDiacritics(input: string): string {
    return input
        .normalize("NFD")
        .replace(COMBINING_DIACRITICS_REGEX, "")
        .replace(/đ/gi, "d");
}

/** Chuan hoa mot chuoi tieng Viet co dau/khong dau ve dang "snake_case" khong dau. */
function normalizeEnumInput(input: string): string {
    return stripDiacritics(input.trim().toLowerCase()).replace(/\s+/g, "_");
}

function parseBoolean(raw: unknown): boolean {
    if (typeof raw === "boolean") return raw;
    const normalized = normalizeEnumInput(cellToString(raw));
    return ["co", "true", "1", "x", "yes", "y"].includes(normalized);
}

const INACTIVE_STATUS_VALUES = [
    "ngung_hoat_dong",
    "khong_hoat_dong",
    "khong",
    "false",
    "0",
    "inactive",
];

/**
 * Rieng cho cot "Trạng thái" cua Street (khac ngu nghia Co/Khong cua
 * parseBoolean): rong = dang hoat dong (giong mac dinh active:true cua
 * schema); chi tra ve false khi gia tri ro rang the hien "ngung hoat dong" -
 * tranh vo tinh khoa mot dong hop le vi ghi khac cach viet ma khong nhan dien
 * duoc.
 */
function parseStreetActiveCell(raw: unknown): boolean {
    const str = cellToString(raw).trim();
    if (!str) return true;
    const normalized = normalizeEnumInput(str);
    return !INACTIVE_STATUS_VALUES.includes(normalized);
}

function parseDateCell(value: unknown): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    const str = cellToString(value).trim();
    if (!str) return undefined;

    const dmy = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (dmy) {
        const [, d, m, y] = dmy;
        const date = new Date(Number(y), Number(m) - 1, Number(d));
        return Number.isNaN(date.getTime()) ? undefined : date;
    }

    const parsed = new Date(str);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// ---------------------------------------------------------------------------
// Import nha so
// ---------------------------------------------------------------------------

export type HouseColumnMapping = {
    code: string;
    subZone?: string;
    ownerName?: string;
    ownerPhone?: string;
    headOfHousehold?: string;
    contactPhone?: string;
    usageType?: string;
    residenceStatus?: string;
    hasBusiness?: string;
    memberCount?: string;
    landStatus?: string;
    lotCodeCrossCheck?: string;
    note?: string;
    // KHONG phai cot trong file - gia tri (hoac Tổ dân phố) admin
    // nhap/chon MOT LAN cho ca file, dung khi cot "subZone" khong duoc chon
    // hoac o rong o mot so dong (xem applyHouseImportMapping).
    defaultCluster?: string;
    neighborhoodId?: string;
    // KHONG phai cot trong file - co/khong tick chon MOT LAN cho ca file (xem
    // ghi chu chi tiet o houseImportMappingSchema va commitHouseImport).
    createHouseholds?: boolean;
};

// Cac truong tuong ung 1-1 voi cot trong file (khac defaultCluster/
// neighborhoodId - hai truong "rieng cua ca file", khong phai cot).
const HOUSE_MAPPING_COLUMN_FIELDS: Exclude<
    keyof typeof HOUSE_COLUMNS,
    "code"
>[] = [
    "subZone",
    "ownerName",
    "ownerPhone",
    "headOfHousehold",
    "contactPhone",
    "usageType",
    "residenceStatus",
    "hasBusiness",
    "memberCount",
    "landStatus",
    "lotCodeCrossCheck",
    "note",
];

// Cac cot "phu" (khong co truong rieng tren House) - neu co chon cot, gia
// tri duoc gop lai thanh MOT doan ghi chu duy nhat (chi in nhan co gia tri,
// tranh o trong lam nhieu House.note) - xem ghi chu dau file.
const HOUSE_NOTE_FIELDS: Exclude<
    keyof typeof HOUSE_COLUMNS,
    "code" | "subZone" | "ownerName" | "ownerPhone"
>[] = [
    "headOfHousehold",
    "contactPhone",
    "usageType",
    "residenceStatus",
    "hasBusiness",
    "memberCount",
    "landStatus",
    "lotCodeCrossCheck",
    "note",
];

function buildHouseImportNote(
    values: Record<string, string>,
    mapping: HouseColumnMapping,
): string | undefined {
    const filled = HOUSE_NOTE_FIELDS.map(field => {
        const column = mapping[field];
        const value = column ? (values[column] || "").trim() : "";
        return [HOUSE_COLUMNS[field], value] as [string, string];
    }).filter(([, value]) => !!value);
    if (filled.length === 0) return undefined;
    return filled.map(([label, value]) => `${label}: ${value}`).join("; ");
}

/**
 * Buoc 1 (upload): chi doc header + tung dong tho, CHUA validate theo
 * HOUSE_COLUMNS co dinh - nguoi dung se chon cot ung voi tung truong o buoc
 * sau (xem applyHouseImportMapping), vi nhan cot trong file thuc te tu nhieu
 * to dan pho khac nhau khong phai luc nao cung khop voi nhan mong doi (giong
 * uploadStreetImportFile o duoi).
 */
export async function uploadHouseImportFile(
    actorId: string,
    fileBuffer: Buffer,
    fileName: string,
): Promise<IImportJob> {
    const { headers, rows } = await readWorksheetRows(fileBuffer);

    const rawRows = rows.map(row => {
        const values: Record<string, string> = {};
        for (const header of headers) {
            if (header in row.values) {
                values[header] = cellToString(row.values[header]).trim();
            }
        }
        return { rowNumber: row.rowNumber, values };
    });

    const suggestedMapping: Record<string, string> = {};
    for (const [field, expectedLabel] of Object.entries(HOUSE_COLUMNS)) {
        const match = headers.find(
            h => normalizeEnumInput(h) === normalizeEnumInput(expectedLabel),
        );
        if (match) suggestedMapping[field] = match;
    }

    const job = await ImportJob.create({
        type: "house",
        status: "awaiting_mapping",
        fileName,
        totalRows: rows.length,
        validRows: 0,
        headers,
        rawRows,
        suggestedMapping,
        columnMapping: {},
        rowErrors: [],
        previewData: [],
        committedCount: 0,
        createdBy: actorId,
    });

    return job;
}

/**
 * Buoc 2 (chon cot): ap dung mapping do nguoi dung xac nhan len du lieu tho
 * da luu o buoc upload, roi chay lai logic validate/preview (bat buoc chon
 * cot cho "Mã căn/hộ", chong trung ma trong file va trong he thong, cum dan
 * cu tu cot hoac gia tri mac dinh cho ca file...). Co the goi lai nhieu lan
 * (vd nguoi dung sua mapping) mien la job chua commit - giong
 * applyStreetImportMapping o duoi.
 */
export async function applyHouseImportMapping(
    importJobId: string,
    mapping: HouseColumnMapping,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "house") {
        throw new HttpError("Import job này không phải loại nhà số", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }

    const headers = job.headers;
    if (!mapping.code || !headers.includes(mapping.code)) {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu tương ứng với 'Mã căn/hộ'",
            422,
        );
    }
    for (const field of HOUSE_MAPPING_COLUMN_FIELDS) {
        const column = mapping[field];
        if (column && !headers.includes(column)) {
            throw new HttpError(
                `Cột đã chọn cho '${HOUSE_COLUMNS[field]}' không hợp lệ`,
                422,
            );
        }
    }
    const mappedColumns = [
        mapping.code,
        ...HOUSE_MAPPING_COLUMN_FIELDS.map(field => mapping[field]),
    ].filter(Boolean) as string[];
    if (new Set(mappedColumns).size !== mappedColumns.length) {
        throw new HttpError(
            "Không thể chọn cùng một cột cho nhiều trường dữ liệu khác nhau",
            422,
        );
    }

    const defaultCluster = mapping.defaultCluster?.trim() || undefined;
    const neighborhoodId = mapping.neighborhoodId || undefined;
    const rows = job.rawRows;

    // Doi chieu ma nha trung lap voi DB TRUOC (mot lan, giong ky thuat cua
    // applyStreetImportMapping) - tranh N truy van rieng le cho tung dong.
    const codesInFile = new Set<string>();
    for (const row of rows) {
        const code = (row.values[mapping.code] || "").trim();
        if (code) codesInFile.add(code);
    }
    const existingHouses = await HouseRecord.find({
        code: { $in: Array.from(codesInFile) },
    }).select("code");
    // code -> houseId, dung de nhan biet dong nao la "cap nhat" (nha da ton
    // tai) thay vi "tao moi" - xem ghi chu o duoi va mergeIntoExistingHouse.
    const existingCodeToId = new Map(
        existingHouses.map(h => [h.code, String(h._id)]),
    );
    const seenCodes = new Set<string>();

    const errors: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    for (const row of rows) {
        const code = (row.values[mapping.code] || "").trim();
        const subZone = mapping.subZone
            ? (row.values[mapping.subZone] || "").trim()
            : "";
        const ownerName = mapping.ownerName
            ? (row.values[mapping.ownerName] || "").trim()
            : "";
        const ownerPhone = mapping.ownerPhone
            ? (row.values[mapping.ownerPhone] || "").trim()
            : "";
        const headOfHousehold = mapping.headOfHousehold
            ? (row.values[mapping.headOfHousehold] || "").trim()
            : "";
        const contactPhone = mapping.contactPhone
            ? (row.values[mapping.contactPhone] || "").trim()
            : "";
        const usageType = mapping.usageType
            ? (row.values[mapping.usageType] || "").trim()
            : "";
        const hasBusinessCell = mapping.hasBusiness
            ? (row.values[mapping.hasBusiness] || "").trim()
            : "";

        const rowErrors: string[] = [];
        if (!code) rowErrors.push("Thiếu 'Mã căn/hộ'");
        if (code) {
            if (seenCodes.has(code)) {
                rowErrors.push(`Mã "${code}" xuất hiện nhiều lần trong file`);
            } else {
                seenCodes.add(code);
            }
        }

        // Nha da ton tai (trung "Mã căn/hộ" voi HouseRecord co san) KHONG con
        // bi bao loi nhu truoc - dong nay se duoc COMMIT nhu mot lan "cap
        // nhat" (chi dien vao truong dang trong, khong ghi de du lieu da co,
        // xem mergeIntoExistingHouse) thay vi tao moi. cluster/address vi vay
        // chi bat buoc khi TAO MOI.
        const existingHouseId = code ? existingCodeToId.get(code) : undefined;

        const cluster = subZone || defaultCluster;
        if (!existingHouseId && !cluster) {
            rowErrors.push(
                "Thiếu 'Phân khu/dãy' và chưa nhập cụm dân cư mặc định cho cả file",
            );
        }

        if (rowErrors.length > 0) {
            errors.push({ row: row.rowNumber, message: rowErrors.join("; ") });
            continue;
        }

        // Chi tao tai khoan chu nha khi CA ten VA sdt hop le - thieu mot
        // trong hai (hoac khong chon cot) thi van tao House, chi la chua co
        // chu nha (xem ghi chu dau file). SDT khong hop le khong chan dong,
        // chi bo qua viec tao tai khoan.
        const hasValidOwner = !!ownerName && isValidVnPhone(ownerPhone);

        previewData.push({
            code,
            cluster: cluster || undefined,
            address: cluster ? (subZone ? `${subZone} - ${code}` : code) : undefined,
            existingHouseId,
            neighborhoodId,
            ownerName: hasValidOwner ? ownerName : undefined,
            ownerPhone: hasValidOwner ? ownerPhone : undefined,
            note: buildHouseImportNote(row.values, mapping),
            // Du lieu rieng de tao Household khi mapping.createHouseholds=true
            // (xem commitHouseImport) - tinh san o day, chi thuc su dung khi
            // co bat tuy chon, khong anh huong den House neu khong bat.
            householdHeadOfHousehold: headOfHousehold || ownerName || undefined,
            householdPhone: contactPhone || ownerPhone || undefined,
            hasBusinessSignal:
                (hasBusinessCell && parseBoolean(hasBusinessCell)) ||
                normalizeEnumInput(usageType).includes("kinh_doanh"),
        });
    }

    job.columnMapping = mapping;
    job.rowErrors = errors;
    job.previewData = previewData;
    job.validRows = previewData.length;
    job.status = errors.length === 0 ? "validated" : "previewing";
    await job.save();

    return job;
}

/**
 * Khi "Mã căn/hộ" cua mot dong DA TON TAI trong he thong (xem
 * applyHouseImportMapping) - thay vi tao moi/bao loi, CHI dien vao cac
 * truong dang TRONG (khong ghi de du lieu da co san) roi tra ve House do de
 * dung tiep cho buoc tao/dien Household ben duoi.
 *
 * Chi ap dung cho nha CHUA xac thuc ("unverified"/"pending") - nha da
 * "verified" bi bao ve boi HOUSE_RECORD_PROTECTED_FIELDS (phai qua
 * ChangeRequest de sua, xem houseRecordService.updateHouseRecord), nen import
 * hang loat KHONG duoc phep am tham bo qua co che nay - neu nha da xac thuc/
 * bi tu choi/khoa, ham nay khong sua gi ca (dong van tinh la "thanh cong",
 * chi la khong co gi thay doi).
 *
 * KHONG gan/doi chu nha o day du dong co "Chủ sở hữu đứng tên" hop le - gan
 * chu nha cho mot nha DA TON TAI la mot hanh dong rieng, rui ro hon (tao/lien
 * ket tai khoan dang nhap that su qua addHouseOwnership), chua duoc yeu cau -
 * nha con thieu chu van duoc dien cac truong khac, chu nha phai gan thu cong
 * qua man chi tiet nha.
 */
async function mergeIntoExistingHouse(
    actorUser: IUser,
    houseId: string,
    row: Record<string, unknown>,
) {
    const houseRecord = await HouseRecord.findById(houseId);
    if (!houseRecord) throw new HttpError("Không tìm thấy nhà số", 404);
    await assertHouseRecordInScope(actorUser, houseRecord);

    if (houseRecord.status === "unverified" || houseRecord.status === "pending") {
        const note = row.note as string | undefined;
        const neighborhoodId = row.neighborhoodId as string | undefined;
        let changed = false;
        if (!houseRecord.note && note) {
            houseRecord.note = note;
            changed = true;
        }
        if (!houseRecord.neighborhoodId && neighborhoodId) {
            houseRecord.neighborhoodId = neighborhoodId as unknown as typeof houseRecord.neighborhoodId;
            changed = true;
        }
        if (changed) {
            houseRecord.updatedBy = actorUser._id as unknown as typeof houseRecord.updatedBy;
            await houseRecord.save();
        }
    }

    return houseRecord;
}

export async function commitHouseImport(
    actorUser: IUser,
    importJobId: string,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "house") {
        throw new HttpError("Import job này không phải loại nhà số", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.status === "awaiting_mapping") {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu (mapping) trước khi commit",
            400,
        );
    }
    if (job.rowErrors.length > 0) {
        throw new HttpError(
            "Dữ liệu còn lỗi, vui lòng sửa và tạo lại preview trước khi commit",
            400,
        );
    }

    // KHONG phai cot trong file - co/khong tick chon MOT LAN cho ca file luc
    // "chon cot" (xem applyHouseImportMapping) - luu trong columnMapping da
    // duoc job.save() o buoc do.
    const createHouseholds =
        (job.columnMapping as HouseColumnMapping)?.createHouseholds === true;

    let committedCount = 0;
    let housesCreated = 0;
    let housesMerged = 0;
    let householdsCreated = 0;
    let householdsUpdated = 0;
    for (const row of job.previewData as Record<string, unknown>[]) {
        const existingHouseId = row.existingHouseId as string | undefined;
        let houseRecord;
        if (existingHouseId) {
            // eslint-disable-next-line no-await-in-loop
            houseRecord = await mergeIntoExistingHouse(
                actorUser,
                existingHouseId,
                row,
            );
            housesMerged += 1;
        } else {
            const hasOwner = !!row.ownerName && !!row.ownerPhone;
            // eslint-disable-next-line no-await-in-loop
            houseRecord = await createHouseRecord(actorUser, {
                code: row.code as string,
                cluster: row.cluster as string,
                address: row.address as string,
                note: row.note as string | undefined,
                neighborhoodId:
                    (row.neighborhoodId as string | undefined) || undefined,
                ownerKind: hasOwner ? "individual" : "none",
                createOwnerAccount: hasOwner,
                owner: hasOwner
                    ? {
                          displayName: row.ownerName as string,
                          phone: row.ownerPhone as string,
                      }
                    : undefined,
            });
            housesCreated += 1;
        }
        committedCount += 1;

        // Tao/dien them Household lien ket qua houseId khi nguoi dung bat tuy
        // chon "Cũng tạo hộ dân" - CHI khi dong co ten chu ho (headOfHousehold
        // hoac ownerName, xem applyHouseImportMapping), vi
        // Household.headOfHousehold la truong bat buoc.
        const headOfHousehold = row.householdHeadOfHousehold as
            | string
            | undefined;
        if (createHouseholds && headOfHousehold) {
            // Nha da ton tai co the da co san Household (vd tu lan import
            // truoc) - CHI tao moi khi nha CHUA co Household nao; neu da co
            // dung 1 Household, chi dien vao truong dang trong (phone/note),
            // giong nguyen tac cua mergeIntoExistingHouse o tren. Neu nha co
            // NHIEU HON 1 Household (truong hop hiem, tao thu cong) thi bo
            // qua - khong ro nen dien vao Household nao.
            // eslint-disable-next-line no-await-in-loop
            const existingHouseholds = await Household.find({
                houseId: houseRecord._id,
            }).select("status phone note");

            if (existingHouseholds.length === 0) {
                // eslint-disable-next-line no-await-in-loop
                const householdCode = await generateSequentialCode(
                    Household,
                    "HB",
                    3,
                );
                // eslint-disable-next-line no-await-in-loop
                await Household.create({
                    code: householdCode,
                    cluster: houseRecord.cluster,
                    streetId: houseRecord.streetId,
                    neighborhoodId: houseRecord.neighborhoodId,
                    address: houseRecord.address,
                    headOfHousehold,
                    phone: row.householdPhone as string | undefined,
                    houseId: houseRecord._id,
                    status: resolveInitialVerificationStatus(houseRecord),
                    note: row.hasBusinessSignal
                        ? "Có hoạt động kinh doanh tại địa chỉ này - cần bổ sung Hộ kinh doanh nếu đủ thông tin."
                        : undefined,
                    createdBy: actorUser._id,
                    updatedBy: actorUser._id,
                });
                householdsCreated += 1;
            } else if (existingHouseholds.length === 1) {
                const household = existingHouseholds[0];
                if (
                    household.status === "unverified" ||
                    household.status === "pending"
                ) {
                    const householdPhone = row.householdPhone as
                        | string
                        | undefined;
                    let changed = false;
                    if (!household.phone && householdPhone) {
                        household.phone = householdPhone;
                        changed = true;
                    }
                    if (!household.note && row.hasBusinessSignal) {
                        household.note =
                            "Có hoạt động kinh doanh tại địa chỉ này - cần bổ sung Hộ kinh doanh nếu đủ thông tin.";
                        changed = true;
                    }
                    if (changed) {
                        household.updatedBy =
                            actorUser._id as unknown as typeof household.updatedBy;
                        // eslint-disable-next-line no-await-in-loop
                        await household.save();
                        householdsUpdated += 1;
                    }
                }
            }
        }
    }

    job.status = "committed";
    job.committedCount = committedCount;
    await job.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: job._id,
        metadata: {
            type: "house",
            count: committedCount,
            housesCreated,
            housesMerged,
            householdsCreated,
            householdsUpdated,
        },
    });

    return job;
}

// ---------------------------------------------------------------------------
// Import ho dan
// ---------------------------------------------------------------------------

export async function previewHouseholdImport(
    actorId: string,
    fileBuffer: Buffer,
    fileName: string,
): Promise<IImportJob> {
    const { rows } = await readWorksheetRows(fileBuffer);
    const errors: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    for (const row of rows) {
        const v = row.values;
        const cluster = cellToString(v[HOUSEHOLD_COLUMNS.cluster]).trim();
        const address = cellToString(v[HOUSEHOLD_COLUMNS.address]).trim();
        const headOfHousehold = cellToString(
            v[HOUSEHOLD_COLUMNS.headOfHousehold],
        ).trim();
        const phone = cellToString(v[HOUSEHOLD_COLUMNS.phone]).trim();
        const ownershipRaw = cellToString(
            v[HOUSEHOLD_COLUMNS.ownershipType],
        ).trim();
        const note = cellToString(v[HOUSEHOLD_COLUMNS.note]).trim();

        const rowErrors: string[] = [];
        if (!cluster) rowErrors.push("Thiếu 'Cụm dân cư'");
        if (!address) rowErrors.push("Thiếu 'Địa chỉ'");
        if (!headOfHousehold) rowErrors.push("Thiếu 'Chủ hộ'");

        let ownershipType: LoaiSoHuu = "chinh_chu";
        if (ownershipRaw) {
            const normalized = normalizeEnumInput(ownershipRaw);
            if (normalized === "chinh_chu" || normalized === "cho_thue") {
                ownershipType = normalized;
            } else {
                rowErrors.push(
                    `Giá trị 'Loại sở hữu' không hợp lệ: "${ownershipRaw}" (chỉ chấp nhận Chính chủ / Cho thuê)`,
                );
            }
        }

        if (rowErrors.length > 0) {
            errors.push({ row: row.rowNumber, message: rowErrors.join("; ") });
            continue;
        }

        previewData.push({
            cluster,
            address,
            headOfHousehold,
            phone: phone || undefined,
            ownershipType,
            needsSupport: parseBoolean(v[HOUSEHOLD_COLUMNS.needsSupport]),
            note: note || undefined,
        });
    }

    const job = await ImportJob.create({
        type: "household",
        status: errors.length === 0 ? "validated" : "previewing",
        fileName,
        totalRows: rows.length,
        validRows: previewData.length,
        rowErrors: errors,
        previewData,
        committedCount: 0,
        createdBy: actorId,
    });

    return job;
}

export async function commitHouseholdImport(
    actorId: string,
    importJobId: string,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "household") {
        throw new HttpError("Import job này không phải loại hộ dân", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.rowErrors.length > 0) {
        throw new HttpError(
            "Dữ liệu còn lỗi, vui lòng sửa và tạo lại preview trước khi commit",
            400,
        );
    }

    let committedCount = 0;
    for (const row of job.previewData as Record<string, unknown>[]) {
        // eslint-disable-next-line no-await-in-loop
        const code = await generateSequentialCode(Household, "HB", 3);
        // eslint-disable-next-line no-await-in-loop
        await Household.create({
            code,
            cluster: row.cluster,
            address: row.address,
            headOfHousehold: row.headOfHousehold,
            phone: row.phone,
            ownershipType: row.ownershipType,
            needsSupport: row.needsSupport,
            note: row.note,
            createdBy: actorId,
            updatedBy: actorId,
        });
        committedCount += 1;
    }

    job.status = "committed";
    job.committedCount = committedCount;
    await job.save();

    await writeAuditLog({
        actorId,
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: job._id,
        metadata: { type: "household", count: committedCount },
    });

    return job;
}

// ---------------------------------------------------------------------------
// Import nhan khau
// ---------------------------------------------------------------------------

export type CitizenColumnMapping = {
    fullName: string;
    phone?: string;
    cccd?: string;
    birthDate?: string;
    gender?: string;
    relationToHead?: string;
    householdCode?: string;
    houseCode?: string;
    residenceType?: string;
    isElderly?: string;
    isChild?: string;
    isDisabledOrSupportNeeded?: string;
    isPartyMember?: string;
    isUnionMember?: string;
};

// Cac truong tuong ung 1-1 voi cot trong file, tru "fullName" (bat buoc, xu
// ly rieng - xem applyCitizenImportMapping).
const CITIZEN_MAPPING_COLUMN_FIELDS: Exclude<
    keyof typeof CITIZEN_COLUMNS,
    "fullName"
>[] = [
    "phone",
    "cccd",
    "birthDate",
    "gender",
    "relationToHead",
    "householdCode",
    "houseCode",
    "residenceType",
    "isElderly",
    "isChild",
    "isDisabledOrSupportNeeded",
    "isPartyMember",
    "isUnionMember",
];

/**
 * Buoc 1 (upload): chi doc header + tung dong tho, CHUA validate theo
 * CITIZEN_COLUMNS co dinh - nguoi dung se chon cot ung voi tung truong o
 * buoc sau (xem applyCitizenImportMapping), giong uploadHouseImportFile.
 */
export async function uploadCitizenImportFile(
    actorId: string,
    fileBuffer: Buffer,
    fileName: string,
): Promise<IImportJob> {
    const { headers, rows } = await readWorksheetRows(fileBuffer);

    const rawRows = rows.map(row => {
        const values: Record<string, string> = {};
        for (const header of headers) {
            if (header in row.values) {
                values[header] = cellToString(row.values[header]).trim();
            }
        }
        return { rowNumber: row.rowNumber, values };
    });

    const suggestedMapping: Record<string, string> = {};
    for (const [field, expectedLabel] of Object.entries(CITIZEN_COLUMNS)) {
        const match = headers.find(
            h => normalizeEnumInput(h) === normalizeEnumInput(expectedLabel),
        );
        if (match) suggestedMapping[field] = match;
    }

    const job = await ImportJob.create({
        type: "citizen",
        status: "awaiting_mapping",
        fileName,
        totalRows: rows.length,
        validRows: 0,
        headers,
        rawRows,
        suggestedMapping,
        columnMapping: {},
        rowErrors: [],
        previewData: [],
        committedCount: 0,
        createdBy: actorId,
    });

    return job;
}

/**
 * Buoc 2 (chon cot): ap dung mapping do nguoi dung xac nhan len du lieu tho
 * da luu o buoc upload - bat buoc chon cot cho "Họ tên", va MOT TRONG HAI
 * "Mã hộ"/"Mã căn/hộ" de liên ket toi ho dan (schema da rang buoc it nhat
 * mot trong hai o tang validator, o day chi validate lai cho chac va xu ly
 * tung dong). Co the goi lai nhieu lan mien la job chua commit - giong
 * applyHouseImportMapping.
 */
export async function applyCitizenImportMapping(
    importJobId: string,
    mapping: CitizenColumnMapping,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "citizen") {
        throw new HttpError("Import job này không phải loại nhân khẩu", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }

    const headers = job.headers;
    if (!mapping.fullName || !headers.includes(mapping.fullName)) {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu tương ứng với 'Họ tên'",
            422,
        );
    }
    if (!mapping.householdCode && !mapping.houseCode) {
        throw new HttpError(
            "Vui lòng chọn cột 'Mã hộ' hoặc 'Mã căn/hộ' để liên kết nhân khẩu với hộ dân",
            422,
        );
    }
    for (const field of CITIZEN_MAPPING_COLUMN_FIELDS) {
        const column = mapping[field];
        if (column && !headers.includes(column)) {
            throw new HttpError(
                `Cột đã chọn cho '${CITIZEN_COLUMNS[field]}' không hợp lệ`,
                422,
            );
        }
    }
    const mappedColumns = [
        mapping.fullName,
        ...CITIZEN_MAPPING_COLUMN_FIELDS.map(field => mapping[field]),
    ].filter(Boolean) as string[];
    if (new Set(mappedColumns).size !== mappedColumns.length) {
        throw new HttpError(
            "Không thể chọn cùng một cột cho nhiều trường dữ liệu khác nhau",
            422,
        );
    }

    const rows = job.rawRows;

    // Tra cuu truoc (mot lan) Household theo "Mã hộ" (neu co chon cot) - giong
    // ky thuat cua applyHouseImportMapping/applyBusinessImportMapping.
    const householdCodesInFile = new Set<string>();
    const houseCodesInFile = new Set<string>();
    for (const row of rows) {
        if (mapping.householdCode) {
            const code = (row.values[mapping.householdCode] || "").trim();
            if (code) householdCodesInFile.add(code);
        }
        if (mapping.houseCode) {
            const code = (row.values[mapping.houseCode] || "").trim();
            if (code) houseCodesInFile.add(code);
        }
    }
    const householdsByCode = await Household.find({
        code: { $in: Array.from(householdCodesInFile) },
    }).select("code");
    const householdCodeToId = new Map(
        householdsByCode.map(h => [h.code, String(h._id)]),
    );

    // "Mã căn/hộ" khong khop truc tiep Household - phai qua HouseRecord.code
    // truoc, roi tim (dung) Household DANG lien ket voi nha do qua houseId
    // (xem tuy chon "createHouseholds" cua Import nha so o dau file).
    const housesByCode = await HouseRecord.find({
        code: { $in: Array.from(houseCodesInFile) },
    }).select("code");
    const houseCodeToId = new Map(housesByCode.map(h => [h.code, String(h._id)]));
    const householdsByHouseId = await Household.find({
        houseId: { $in: Array.from(houseCodeToId.values()) },
    }).select("houseId code");
    const houseIdToHouseholdIds = new Map<string, string[]>();
    for (const household of householdsByHouseId) {
        const key = String(household.houseId);
        const list = houseIdToHouseholdIds.get(key) || [];
        list.push(String(household._id));
        houseIdToHouseholdIds.set(key, list);
    }

    const errors: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    for (const row of rows) {
        const v = row.values;
        const fullName = (v[mapping.fullName] || "").trim();
        const genderRaw = mapping.gender ? (v[mapping.gender] || "").trim() : "";
        const residenceRaw = mapping.residenceType
            ? (v[mapping.residenceType] || "").trim()
            : "";

        const rowErrors: string[] = [];
        if (!fullName) rowErrors.push("Thiếu 'Họ tên'");

        // Uu tien "Mã hộ" cho tung dong neu co gia tri o ca hai cot (xem ghi
        // chu dau file) - chi fallback sang "Mã căn/hộ" khi "Mã hộ" trong.
        const householdCode = mapping.householdCode
            ? (v[mapping.householdCode] || "").trim()
            : "";
        const houseCode = mapping.houseCode
            ? (v[mapping.houseCode] || "").trim()
            : "";

        let householdId: string | undefined;
        if (householdCode) {
            householdId = householdCodeToId.get(householdCode);
            if (!householdId) {
                rowErrors.push(`Không tìm thấy hộ dân với mã "${householdCode}"`);
            }
        } else if (houseCode) {
            const houseId = houseCodeToId.get(houseCode);
            if (!houseId) {
                rowErrors.push(`Không tìm thấy nhà số có mã "${houseCode}"`);
            } else {
                const householdIds = houseIdToHouseholdIds.get(houseId) || [];
                if (householdIds.length === 0) {
                    rowErrors.push(
                        `Nhà số "${houseCode}" chưa có hộ dân nào được tạo`,
                    );
                } else if (householdIds.length > 1) {
                    rowErrors.push(
                        `Nhà số "${houseCode}" có nhiều hộ dân, vui lòng dùng cột 'Mã hộ' để xác định chính xác`,
                    );
                } else {
                    [householdId] = householdIds;
                }
            }
        } else {
            rowErrors.push("Thiếu 'Mã hộ' hoặc 'Mã căn/hộ'");
        }

        let gender: GioiTinh = "nam";
        if (genderRaw) {
            const normalized = normalizeEnumInput(genderRaw);
            if ((GIOI_TINH as readonly string[]).includes(normalized)) {
                gender = normalized as GioiTinh;
            } else {
                rowErrors.push(
                    `Giá trị 'Giới tính' không hợp lệ: "${genderRaw}"`,
                );
            }
        }

        let residenceType: LoaiCuTru = "thuong_tru";
        if (residenceRaw) {
            const normalized = normalizeEnumInput(residenceRaw);
            if ((LOAI_CU_TRU as readonly string[]).includes(normalized)) {
                residenceType = normalized as LoaiCuTru;
            } else {
                rowErrors.push(
                    `Giá trị 'Thường trú/Tạm trú' không hợp lệ: "${residenceRaw}"`,
                );
            }
        }

        if (rowErrors.length > 0) {
            errors.push({ row: row.rowNumber, message: rowErrors.join("; ") });
            continue;
        }

        previewData.push({
            fullName,
            phone: mapping.phone ? (v[mapping.phone] || "").trim() || undefined : undefined,
            cccd: mapping.cccd ? (v[mapping.cccd] || "").trim() || undefined : undefined,
            birthDate: mapping.birthDate
                ? parseDateCell(v[mapping.birthDate])?.toISOString()
                : undefined,
            gender,
            relationToHead: mapping.relationToHead
                ? (v[mapping.relationToHead] || "").trim() || undefined
                : undefined,
            householdId,
            residenceType,
            isElderly: mapping.isElderly
                ? parseBoolean(v[mapping.isElderly])
                : false,
            isChild: mapping.isChild ? parseBoolean(v[mapping.isChild]) : false,
            isDisabledOrSupportNeeded: mapping.isDisabledOrSupportNeeded
                ? parseBoolean(v[mapping.isDisabledOrSupportNeeded])
                : false,
            isPartyMember: mapping.isPartyMember
                ? parseBoolean(v[mapping.isPartyMember])
                : false,
            isUnionMember: mapping.isUnionMember
                ? parseBoolean(v[mapping.isUnionMember])
                : false,
        });
    }

    job.columnMapping = mapping;
    job.rowErrors = errors;
    job.previewData = previewData;
    job.validRows = previewData.length;
    job.status = errors.length === 0 ? "validated" : "previewing";
    await job.save();

    return job;
}

export async function commitCitizenImport(
    actorId: string,
    importJobId: string,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "citizen") {
        throw new HttpError("Import job này không phải loại nhân khẩu", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.status === "awaiting_mapping") {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu (mapping) trước khi commit",
            400,
        );
    }
    if (job.rowErrors.length > 0) {
        throw new HttpError(
            "Dữ liệu còn lỗi, vui lòng sửa và tạo lại preview trước khi commit",
            400,
        );
    }

    let committedCount = 0;
    // memberCount cua ho dan lien quan duoc +1 cho moi Citizen import thanh
    // cong - gom theo householdId roi cap nhat 1 lan bang bulkWrite (thay vi
    // recompute/update rieng le cho tung dong) de tranh O(n) update khi import
    // nhieu nhan khau cung luc.
    const memberCountDeltas = new Map<string, number>();
    for (const row of job.previewData as Record<string, unknown>[]) {
        // eslint-disable-next-line no-await-in-loop
        await Citizen.create({
            fullName: row.fullName,
            phone: row.phone,
            cccd: row.cccd,
            birthDate: row.birthDate
                ? new Date(row.birthDate as string)
                : undefined,
            gender: row.gender,
            relationToHead: row.relationToHead,
            householdId: row.householdId,
            residenceType: row.residenceType,
            isElderly: !!row.isElderly,
            isChild: !!row.isChild,
            isDisabledOrSupportNeeded: !!row.isDisabledOrSupportNeeded,
            isPartyMember: !!row.isPartyMember,
            isUnionMember: !!row.isUnionMember,
            createdBy: actorId,
            updatedBy: actorId,
        });
        committedCount += 1;
        if (row.householdId) {
            const key = String(row.householdId);
            memberCountDeltas.set(key, (memberCountDeltas.get(key) || 0) + 1);
        }
    }

    if (memberCountDeltas.size > 0) {
        await Household.bulkWrite(
            Array.from(memberCountDeltas.entries()).map(
                ([householdId, delta]) => ({
                    updateOne: {
                        filter: { _id: householdId },
                        update: { $inc: { memberCount: delta } },
                    },
                }),
            ),
        );
    }

    job.status = "committed";
    job.committedCount = committedCount;
    await job.save();

    await writeAuditLog({
        actorId,
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: job._id,
        metadata: { type: "citizen", count: committedCount },
    });

    return job;
}

// ---------------------------------------------------------------------------
// Import duong/pho
// ---------------------------------------------------------------------------

export type StreetColumnMapping = {
    name: string;
    code?: string;
    active?: string;
};

/**
 * File mau de nguoi dung dien du lieu truoc khi tai len (buoc upload van
 * chap nhan bat ky ten cot nao - file nay chi la goi y, dung dung 3 nhan cot
 * trong STREET_COLUMNS de he thong tu gan mapping ngay, khong can chon lai).
 */
export function buildStreetImportTemplateWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Đường phố");
    worksheet.columns = [
        { header: STREET_COLUMNS.name, key: "name", width: 30 },
        { header: STREET_COLUMNS.code, key: "code", width: 18 },
        { header: STREET_COLUMNS.active, key: "active", width: 20 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRow({
        name: "Nguyễn Trãi",
        code: "",
        active: "Đang hoạt động",
    });
    worksheet.addRow({
        name: "Lê Lợi",
        code: "LELOI",
        active: "Ngừng hoạt động",
    });
    return workbook;
}

/**
 * Buoc 1 (upload): chi doc header + tung dong tho, CHUA validate theo
 * STREET_COLUMNS co dinh - nguoi dung se chon cot ung voi tung truong o buoc
 * sau (xem applyStreetImportMapping), vi nhan cot trong file thuc te khong
 * phai luc nao cung khop voi nhan mong doi.
 */
export async function uploadStreetImportFile(
    actorId: string,
    fileBuffer: Buffer,
    fileName: string,
): Promise<IImportJob> {
    const { headers, rows } = await readWorksheetRows(fileBuffer);

    const rawRows = rows.map(row => {
        const values: Record<string, string> = {};
        for (const header of headers) {
            if (header in row.values) {
                values[header] = cellToString(row.values[header]).trim();
            }
        }
        return { rowNumber: row.rowNumber, values };
    });

    // Goi y mapping: doi chieu header phat hien duoc voi nhan mong doi trong
    // STREET_COLUMNS (khong phan biet hoa/thuong/dau) - chi la goi y ban dau,
    // nguoi dung co the sua o buoc chon cot.
    const suggestedMapping: Record<string, string> = {};
    for (const [field, expectedLabel] of Object.entries(STREET_COLUMNS)) {
        const match = headers.find(
            h => normalizeEnumInput(h) === normalizeEnumInput(expectedLabel),
        );
        if (match) suggestedMapping[field] = match;
    }

    const job = await ImportJob.create({
        type: "street",
        status: "awaiting_mapping",
        fileName,
        totalRows: rows.length,
        validRows: 0,
        headers,
        rawRows,
        suggestedMapping,
        columnMapping: {},
        rowErrors: [],
        previewData: [],
        committedCount: 0,
        createdBy: actorId,
    });

    return job;
}

/**
 * Buoc 2 (chon cot): ap dung mapping do nguoi dung xac nhan (cot nao la ten,
 * cot nao la ma, cot nao la trang thai) len du lieu tho da luu o buoc upload,
 * roi chay lai dung logic validate/preview nhu truoc (bat buoc ten, chong
 * trung ten/ma trong file va trong he thong, tu sinh ma neu khong chon cot
 * ma). Co the goi lai nhieu lan (vd nguoi dung sua mapping) mien la job chua
 * commit.
 */
export async function applyStreetImportMapping(
    importJobId: string,
    mapping: StreetColumnMapping,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "street") {
        throw new HttpError("Import job này không phải loại đường/phố", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }

    const headers = job.headers;
    if (!mapping.name || !headers.includes(mapping.name)) {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu tương ứng với 'Tên đường/phố'",
            422,
        );
    }
    if (mapping.code && !headers.includes(mapping.code)) {
        throw new HttpError("Cột đã chọn cho 'Mã đường/phố' không hợp lệ", 422);
    }
    if (mapping.active && !headers.includes(mapping.active)) {
        throw new HttpError("Cột đã chọn cho 'Trạng thái' không hợp lệ", 422);
    }
    const mappedHeaders = [mapping.name, mapping.code, mapping.active].filter(
        Boolean,
    ) as string[];
    if (new Set(mappedHeaders).size !== mappedHeaders.length) {
        throw new HttpError(
            "Không thể chọn cùng một cột cho nhiều trường dữ liệu khác nhau",
            422,
        );
    }

    const rows = job.rawRows;

    // Tra cuu truoc (mot lan, khong lap tung dong) de doi chieu trung ma/ten
    // voi du lieu da co trong he thong - giong ky thuat build Map mot lan cua
    // applyCitizenImportMapping cho householdCode.
    const namesInSheet = new Set<string>();
    const codesInSheet = new Set<string>();
    for (const row of rows) {
        const name = row.values[mapping.name] || "";
        const code = mapping.code ? row.values[mapping.code] || "" : "";
        if (name) namesInSheet.add(name);
        if (code) codesInSheet.add(code);
    }
    const existingStreets = await Street.find({
        $or: [
            { name: { $in: Array.from(namesInSheet) } },
            { code: { $in: Array.from(codesInSheet) } },
        ],
    }).select("name code");
    const existingNames = new Set(existingStreets.map(s => s.name));
    const existingCodes = new Set(existingStreets.map(s => s.code));

    // Trung lap TRONG chinh file (hai dong cung ten/ma) cung phai bi chan,
    // khong chi trung voi DB - theo doi cac ten/ma da "dung" boi mot dong hop
    // le truoc do trong cung lan preview nay.
    const seenNames = new Set<string>();
    const seenCodes = new Set<string>();

    const errors: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    for (const row of rows) {
        const name = (row.values[mapping.name] || "").trim();
        const codeInput = (mapping.code ? row.values[mapping.code] : "") || "";
        const active = mapping.active
            ? parseStreetActiveCell(row.values[mapping.active])
            : true;

        const rowErrors: string[] = [];
        if (!name) rowErrors.push("Thiếu 'Tên đường/phố'");

        if (name) {
            if (existingNames.has(name) || seenNames.has(name)) {
                rowErrors.push(`Tên đường/phố "${name}" đã tồn tại`);
            } else {
                seenNames.add(name);
            }
        }

        let code = codeInput.trim();
        if (code) {
            if (existingCodes.has(code) || seenCodes.has(code)) {
                rowErrors.push(`Mã đường/phố "${code}" đã tồn tại`);
            } else {
                seenCodes.add(code);
            }
        }

        if (rowErrors.length > 0) {
            errors.push({ row: row.rowNumber, message: rowErrors.join("; ") });
            continue;
        }

        if (!code) {
            // eslint-disable-next-line no-await-in-loop
            code = await generateStreetCode(name);
            // generateStreetCode chi doi chieu voi Street da co trong DB, chua
            // biet ve cac ma vua duoc sinh cho CAC DONG KHAC trong cung lan
            // preview nay (vd hai ten khac nhau nhung cung rut gon ve mot ma) -
            // them hau to so dong de dam bao duy nhat trong pham vi file.
            if (seenCodes.has(code) || existingCodes.has(code)) {
                code = `${code}_R${row.rowNumber}`;
            }
            seenCodes.add(code);
        }

        previewData.push({ name, code, active });
    }

    job.columnMapping = mapping;
    job.rowErrors = errors;
    job.previewData = previewData;
    job.validRows = previewData.length;
    job.status = errors.length === 0 ? "validated" : "previewing";
    await job.save();

    return job;
}

export async function commitStreetImport(
    actorId: string,
    importJobId: string,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "street") {
        throw new HttpError("Import job này không phải loại đường/phố", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.status === "awaiting_mapping") {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu (mapping) trước khi commit",
            400,
        );
    }
    if (job.rowErrors.length > 0) {
        throw new HttpError(
            "Dữ liệu còn lỗi, vui lòng sửa và tạo lại preview trước khi commit",
            400,
        );
    }

    let committedCount = 0;
    for (const row of job.previewData as Record<string, unknown>[]) {
        // eslint-disable-next-line no-await-in-loop
        await Street.create({
            name: row.name,
            code: row.code,
            active: row.active,
            createdBy: actorId,
            updatedBy: actorId,
        });
        committedCount += 1;
    }

    job.status = "committed";
    job.committedCount = committedCount;
    await job.save();

    await writeAuditLog({
        actorId,
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: job._id,
        metadata: { type: "street", count: committedCount },
    });

    return job;
}

// ---------------------------------------------------------------------------
// Import ho kinh doanh
// ---------------------------------------------------------------------------

export type BusinessColumnMapping = {
    name: string;
    houseCode: string;
    businessTypeName?: string;
    ownerName?: string;
    taxCode?: string;
    phone?: string;
    active?: string;
    note?: string;
};

// Cac truong tuong ung 1-1 voi cot trong file, tru "name"/"houseCode" (bat
// buoc, xu ly rieng - xem applyBusinessImportMapping).
const BUSINESS_MAPPING_COLUMN_FIELDS: Exclude<
    keyof typeof BUSINESS_COLUMNS,
    "name" | "houseCode"
>[] = ["businessTypeName", "ownerName", "taxCode", "phone", "active", "note"];

/**
 * Buoc 1 (upload): chi doc header + tung dong tho, CHUA validate theo
 * BUSINESS_COLUMNS co dinh - nguoi dung se chon cot ung voi tung truong o
 * buoc sau (xem applyBusinessImportMapping), giong uploadHouseImportFile.
 */
export async function uploadBusinessImportFile(
    actorId: string,
    fileBuffer: Buffer,
    fileName: string,
): Promise<IImportJob> {
    const { headers, rows } = await readWorksheetRows(fileBuffer);

    const rawRows = rows.map(row => {
        const values: Record<string, string> = {};
        for (const header of headers) {
            if (header in row.values) {
                values[header] = cellToString(row.values[header]).trim();
            }
        }
        return { rowNumber: row.rowNumber, values };
    });

    const suggestedMapping: Record<string, string> = {};
    for (const [field, expectedLabel] of Object.entries(BUSINESS_COLUMNS)) {
        const match = headers.find(
            h => normalizeEnumInput(h) === normalizeEnumInput(expectedLabel),
        );
        if (match) suggestedMapping[field] = match;
    }

    const job = await ImportJob.create({
        type: "business",
        status: "awaiting_mapping",
        fileName,
        totalRows: rows.length,
        validRows: 0,
        headers,
        rawRows,
        suggestedMapping,
        columnMapping: {},
        rowErrors: [],
        previewData: [],
        committedCount: 0,
        createdBy: actorId,
    });

    return job;
}

/**
 * Buoc 2 (chon cot): ap dung mapping do nguoi dung xac nhan len du lieu tho
 * da luu o buoc upload, roi chay lai logic validate/preview - bat buoc chon
 * cot cho "Tên hộ kinh doanh" va "Mã nhà" (phai khop mot HouseRecord da ton
 * tai), doi chieu "Loại hình kinh doanh" (neu co) voi BusinessType da co,
 * chong trung "Mã số thuế" (neu co) ca trong file va he thong. Co the goi lai
 * nhieu lan mien la job chua commit - giong applyHouseImportMapping.
 */
export async function applyBusinessImportMapping(
    importJobId: string,
    mapping: BusinessColumnMapping,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "business") {
        throw new HttpError("Import job này không phải loại hộ kinh doanh", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }

    const headers = job.headers;
    if (!mapping.name || !headers.includes(mapping.name)) {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu tương ứng với 'Tên hộ kinh doanh'",
            422,
        );
    }
    if (!mapping.houseCode || !headers.includes(mapping.houseCode)) {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu tương ứng với 'Mã nhà'",
            422,
        );
    }
    for (const field of BUSINESS_MAPPING_COLUMN_FIELDS) {
        const column = mapping[field];
        if (column && !headers.includes(column)) {
            throw new HttpError(
                `Cột đã chọn cho '${BUSINESS_COLUMNS[field]}' không hợp lệ`,
                422,
            );
        }
    }
    const mappedColumns = [
        mapping.name,
        mapping.houseCode,
        ...BUSINESS_MAPPING_COLUMN_FIELDS.map(field => mapping[field]),
    ].filter(Boolean) as string[];
    if (new Set(mappedColumns).size !== mappedColumns.length) {
        throw new HttpError(
            "Không thể chọn cùng một cột cho nhiều trường dữ liệu khác nhau",
            422,
        );
    }

    const rows = job.rawRows;

    // Tra cuu truoc (mot lan) ma nha, loai hinh kinh doanh, va ma so thue da
    // co trong DB - giong ky thuat cua applyHouseImportMapping/
    // applyStreetImportMapping, tranh N truy van rieng le cho tung dong.
    const houseCodesInFile = new Set<string>();
    const taxCodesInFile = new Set<string>();
    for (const row of rows) {
        const houseCode = (row.values[mapping.houseCode] || "").trim();
        if (houseCode) houseCodesInFile.add(houseCode);
        if (mapping.taxCode) {
            const taxCode = (row.values[mapping.taxCode] || "").trim();
            if (taxCode) taxCodesInFile.add(taxCode);
        }
    }
    const houses = await HouseRecord.find({
        code: { $in: Array.from(houseCodesInFile) },
    }).select("code");
    const houseCodeToId = new Map(houses.map(h => [h.code, String(h._id)]));

    const businessTypes = await BusinessType.find({}).select("name");
    const businessTypeNameToId = new Map(
        businessTypes.map(bt => [normalizeEnumInput(bt.name), String(bt._id)]),
    );

    const existingBusinesses = await Business.find({
        taxCode: { $in: Array.from(taxCodesInFile) },
    }).select("taxCode");
    const existingTaxCodes = new Set(
        existingBusinesses.map(b => b.taxCode).filter(Boolean),
    );
    const seenTaxCodes = new Set<string>();

    const errors: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    for (const row of rows) {
        const name = (row.values[mapping.name] || "").trim();
        const houseCode = (row.values[mapping.houseCode] || "").trim();
        const businessTypeNameRaw = mapping.businessTypeName
            ? (row.values[mapping.businessTypeName] || "").trim()
            : "";
        const ownerName = mapping.ownerName
            ? (row.values[mapping.ownerName] || "").trim()
            : "";
        const taxCode = mapping.taxCode
            ? (row.values[mapping.taxCode] || "").trim()
            : "";
        const phone = mapping.phone
            ? (row.values[mapping.phone] || "").trim()
            : "";
        const note = mapping.note
            ? (row.values[mapping.note] || "").trim()
            : "";

        const rowErrors: string[] = [];
        if (!name) rowErrors.push("Thiếu 'Tên hộ kinh doanh'");

        const houseId = houseCode ? houseCodeToId.get(houseCode) : undefined;
        if (!houseCode) {
            rowErrors.push("Thiếu 'Mã nhà'");
        } else if (!houseId) {
            rowErrors.push(`Không tìm thấy nhà số có mã "${houseCode}"`);
        }

        let businessTypeId: string | undefined;
        if (businessTypeNameRaw) {
            businessTypeId = businessTypeNameToId.get(
                normalizeEnumInput(businessTypeNameRaw),
            );
            if (!businessTypeId) {
                rowErrors.push(
                    `Không tìm thấy loại hình kinh doanh "${businessTypeNameRaw}"`,
                );
            }
        }

        if (taxCode) {
            if (existingTaxCodes.has(taxCode) || seenTaxCodes.has(taxCode)) {
                rowErrors.push(`Mã số thuế "${taxCode}" đã tồn tại`);
            } else {
                seenTaxCodes.add(taxCode);
            }
        }

        if (rowErrors.length > 0) {
            errors.push({ row: row.rowNumber, message: rowErrors.join("; ") });
            continue;
        }

        previewData.push({
            name,
            houseCode,
            houseId,
            businessTypeId,
            businessTypeName: businessTypeNameRaw || undefined,
            ownerName: ownerName || undefined,
            taxCode: taxCode || undefined,
            phone: phone || undefined,
            active: mapping.active
                ? parseStreetActiveCell(row.values[mapping.active])
                : true,
            note: note || undefined,
        });
    }

    job.columnMapping = mapping;
    job.rowErrors = errors;
    job.previewData = previewData;
    job.validRows = previewData.length;
    job.status = errors.length === 0 ? "validated" : "previewing";
    await job.save();

    return job;
}

export async function commitBusinessImport(
    actorUser: IUser,
    importJobId: string,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "business") {
        throw new HttpError("Import job này không phải loại hộ kinh doanh", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.status === "awaiting_mapping") {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu (mapping) trước khi commit",
            400,
        );
    }
    if (job.rowErrors.length > 0) {
        throw new HttpError(
            "Dữ liệu còn lỗi, vui lòng sửa và tạo lại preview trước khi commit",
            400,
        );
    }

    let committedCount = 0;
    for (const row of job.previewData as Record<string, unknown>[]) {
        // eslint-disable-next-line no-await-in-loop
        await createBusiness(actorUser, {
            name: row.name as string,
            houseId: row.houseId as string,
            businessType: (row.businessTypeId as string | undefined) || null,
            ownerName: row.ownerName as string | undefined,
            taxCode: row.taxCode as string | undefined,
            phone: row.phone as string | undefined,
            active: row.active as boolean,
            note: row.note as string | undefined,
        });
        committedCount += 1;
    }

    job.status = "committed";
    job.committedCount = committedCount;
    await job.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: job._id,
        metadata: { type: "business", count: committedCount },
    });

    return job;
}

// ---------------------------------------------------------------------------
// Tien ich chung
// ---------------------------------------------------------------------------

export async function getImportJobById(id: string): Promise<IImportJob> {
    const job = await ImportJob.findById(id);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    return job;
}
