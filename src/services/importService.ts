import ExcelJS from "exceljs";
import {
    Household,
    Citizen,
    Street,
    HouseRecord,
    ImportJob,
    type IImportJob,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateSequentialCode } from "@/lib/utils";
import { generateStreetCode } from "@/lib/streetSync";
import { isValidVnPhone } from "@/lib/phone";
import { writeAuditLog } from "@/services/auditService";
import { createHouseRecord } from "@/services/houseRecordService";
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
//     tuan tu NSxxx. Phai duy nhat (ca trong file va trong he thong) - xem
//     createHouseRecord input.code.
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
//     buildHouseImportNote) de khong mat du lieu, thay vi tao them Household
//     (import nay CHI tao House + tai khoan chu nha, khong tao Household).
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
//   Họ tên | Số điện thoại | CCCD | Ngày sinh | Giới tính | Quan hệ với chủ hộ
//   | Mã hộ | Thường trú/Tạm trú | Người cao tuổi | Trẻ em | Người khuyết tật
//   | Đảng viên | Đoàn viên
//   - "Mã hộ" phai la ma ho da ton tai trong he thong (vd HB001), duoc doi chieu
//     truoc khi cho phep commit.
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
    const existingCodes = new Set(existingHouses.map(h => h.code));
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

        const rowErrors: string[] = [];
        if (!code) rowErrors.push("Thiếu 'Mã căn/hộ'");
        if (code) {
            if (existingCodes.has(code) || seenCodes.has(code)) {
                rowErrors.push(`Mã "${code}" đã tồn tại`);
            } else {
                seenCodes.add(code);
            }
        }

        const cluster = subZone || defaultCluster;
        if (!cluster) {
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
            cluster,
            address: subZone ? `${subZone} - ${code}` : code,
            neighborhoodId,
            ownerName: hasValidOwner ? ownerName : undefined,
            ownerPhone: hasValidOwner ? ownerPhone : undefined,
            note: buildHouseImportNote(row.values, mapping),
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

    let committedCount = 0;
    for (const row of job.previewData as Record<string, unknown>[]) {
        const hasOwner = !!row.ownerName && !!row.ownerPhone;
        // eslint-disable-next-line no-await-in-loop
        await createHouseRecord(actorUser, {
            code: row.code as string,
            cluster: row.cluster as string,
            address: row.address as string,
            note: row.note as string | undefined,
            neighborhoodId: (row.neighborhoodId as string | undefined) || undefined,
            ownerKind: hasOwner ? "individual" : "none",
            createOwnerAccount: hasOwner,
            owner: hasOwner
                ? {
                      displayName: row.ownerName as string,
                      phone: row.ownerPhone as string,
                  }
                : undefined,
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
        metadata: { type: "house", count: committedCount },
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

export async function previewCitizenImport(
    actorId: string,
    fileBuffer: Buffer,
    fileName: string,
): Promise<IImportJob> {
    const { rows } = await readWorksheetRows(fileBuffer);

    const codes = Array.from(
        new Set(
            rows
                .map(r =>
                    cellToString(
                        r.values[CITIZEN_COLUMNS.householdCode],
                    ).trim(),
                )
                .filter(Boolean),
        ),
    );
    const households = await Household.find({ code: { $in: codes } }).select(
        "code",
    );
    const codeToId = new Map(households.map(h => [h.code, String(h._id)]));

    const errors: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    for (const row of rows) {
        const v = row.values;
        const fullName = cellToString(v[CITIZEN_COLUMNS.fullName]).trim();
        const householdCode = cellToString(
            v[CITIZEN_COLUMNS.householdCode],
        ).trim();
        const genderRaw = cellToString(v[CITIZEN_COLUMNS.gender]).trim();
        const residenceRaw = cellToString(
            v[CITIZEN_COLUMNS.residenceType],
        ).trim();

        const rowErrors: string[] = [];
        if (!fullName) rowErrors.push("Thiếu 'Họ tên'");
        if (!householdCode) rowErrors.push("Thiếu 'Mã hộ'");

        const householdId = householdCode
            ? codeToId.get(householdCode)
            : undefined;
        if (householdCode && !householdId) {
            rowErrors.push(`Không tìm thấy hộ dân với mã "${householdCode}"`);
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
            phone: cellToString(v[CITIZEN_COLUMNS.phone]).trim() || undefined,
            cccd: cellToString(v[CITIZEN_COLUMNS.cccd]).trim() || undefined,
            birthDate: parseDateCell(
                v[CITIZEN_COLUMNS.birthDate],
            )?.toISOString(),
            gender,
            relationToHead:
                cellToString(v[CITIZEN_COLUMNS.relationToHead]).trim() ||
                undefined,
            householdId,
            residenceType,
            isElderly: parseBoolean(v[CITIZEN_COLUMNS.isElderly]),
            isChild: parseBoolean(v[CITIZEN_COLUMNS.isChild]),
            isDisabledOrSupportNeeded: parseBoolean(
                v[CITIZEN_COLUMNS.isDisabledOrSupportNeeded],
            ),
            isPartyMember: parseBoolean(v[CITIZEN_COLUMNS.isPartyMember]),
            isUnionMember: parseBoolean(v[CITIZEN_COLUMNS.isUnionMember]),
        });
    }

    const job = await ImportJob.create({
        type: "citizen",
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
    // previewCitizenImport cho householdCode.
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
// Tien ich chung
// ---------------------------------------------------------------------------

export async function getImportJobById(id: string): Promise<IImportJob> {
    const job = await ImportJob.findById(id);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    return job;
}
