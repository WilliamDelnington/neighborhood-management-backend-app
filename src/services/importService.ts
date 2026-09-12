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
import { hashForLookup, normalizeCccd } from "@/lib/encryption";
import { addTableSheet, type TableColumn } from "@/lib/excelResponse";
import { writeAuditLog } from "@/services/auditService";
import { recomputeHouseholdFlags } from "@/services/citizenService";
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
//   - "Phân khu/dãy" (neu co chon cot) chi ghi vao House.subZone (truong
//     rieng, thuan mo ta - xem models/HouseRecord.ts) - HOAN TOAN TUY CHON,
//     KHONG con duoc dung lam cluster nua (khac cluster/RBAC scoping - da
//     tach rieng, truoc day hai truong nay bi conflate voi nhau). Mot dong
//     KHONG BAO GIO bi bao loi vi thieu "Phân khu/dãy".
//   - cluster (cum dan cu, truong RBAC/scoping) CHI đến tu "Cụm dân cư mặc
//     định" nguoi dung nhap MOT LAN cho ca file (xem
//     HouseColumnMapping.defaultCluster) - MOI nha MOI tao trong lan import
//     nay se dung CHUNG mot cluster nay (khong con tach theo tung dong nhu
//     truoc). Dong nao TAO MOI (khong trung "Mã căn/hộ" voi nha da co) ma
//     thieu "Cụm dân cư mặc định" se bi bao loi (House bat buoc phai co
//     cluster hoac streetId) - dong cap nhat nha da co (existingHouseId)
//     khong bi anh huong vi nha do da co cluster san.
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
//     tu sheet nay). Neu nha (moi hoac da ton tai) da co san DUNG 1
//     Household, KHONG tao them ban thu hai - ap dung cung nguyen tac "chi
//     dien vao truong dang trong" nhu House o tren (phone/note), va cung chi
//     ap dung khi Household do con "unverified"/"pending". Neu nha co nhieu
//     hon 1 Household (hiem, tao thu cong) thi bo qua, khong ro nen dien vao
//     Household nao.
//   - Moi Household (moi tao HOAC da co san) deu duoc dam bao co it nhat MOT
//     Citizen "Chủ hộ" (fullName = ten chu ho, phone = SĐT hộ dân neu co) -
//     giong bat bien cua householdService.createHousehold, tranh chu ho
//     "bien mat" khoi danh sach nhan khau. Rieng buoc nay AP DUNG BAT KE
//     trang thai xac thuc, va CHO CA Household da ton tai tu lan import
//     truoc (truoc khi tinh nang nay ton tai) - chi kich hoat khi Household
//     do dang co DUNG 0 Citizen, vi day la bo sung du lieu con thieu chu
//     khong phai sua du lieu da co. Ket qua: chay lai (import lai) chinh
//     file da dung se tu dong bo sung chu ho cho cac ho dan bi thieu.
//     memberCount duoc dat = 1 khi do. CANH BAO: neu sau nay import them
//     "Chi tiết nhân khẩu" (xem "Import nhan khau" o duoi) ma sheet do CUNG
//     liet ke chinh chu ho nhu mot dong rieng, se co HAI ban ghi Citizen
//     "Chủ hộ" cho cung mot ho dan (mot ban toi thieu tu day, mot ban day du
//     hon tu sheet nhan khau) - he thong khong tu gop/khu trung hai ban nay,
//     admin can tu xoa ban trung neu gap truong hop nay.
//   - "defaultPassword" (KHONG phai cot - admin nhap MOT LAN cho ca file):
//     khi co, MOI tai khoan chu nha MOI tao trong lan import nay (dong co ca
//     "Chủ sở hữu đứng tên" + "SĐT chủ sở hữu" hop le) se duoc dat mat khau
//     nay qua createHouseRecord -> resolveOrCreateHouseOwner. Vi nhieu tai
//     khoan dung chung MOT mat khau, moi tai khoan duoc tao theo cach nay se
//     tu dong bat User.mustChangePassword=true - bi chan moi API khac ngoai
//     doi mat khau (xem rbac.ts requireUser) cho toi khi tu doi. KHONG anh
//     huong tai khoan da ton tai tu truoc (resolveOrCreateHouseOwner khong
//     bao gio ghi de mat khau cua tai khoan co san).
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
    occupation: "Nghề nghiệp/nơi làm việc",
    householdCode: "Mã hộ",
    // Cot lien ket THAY THE cho householdCode - xem ghi chu "Import nhan
    // khau" o dau file va applyCitizenImportMapping.
    houseCode: "Mã căn/hộ",
    residenceType: "Thường trú/Tạm trú",
    temporaryResidenceStartsAt: "Ngày bắt đầu tạm trú",
    temporaryResidenceExpiresAt: "Ngày hết hạn tạm trú",
    isResidencyDeclared: "Đã khai báo cư trú",
    isUnemployed: "Đang thất nghiệp",
    isElderly: "Người cao tuổi",
    isChild: "Trẻ em",
    isDisabledOrSupportNeeded: "Người khuyết tật",
    isDisabledChild: "Trẻ em khuyết tật",
    isPartyMember: "Đảng viên",
    isUnionMember: "Đoàn viên",
    isMartyr: "Liệt sĩ",
    isMartyrFamily: "Gia đình liệt sĩ",
    isVeteran: "Cựu chiến binh",
    isOtherSpecial: "Diện ưu tiên khác",
    otherSpecialLabel: "Tên diện ưu tiên khác",
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

/**
 * Doc mot sheet trong file Excel thanh header + tung dong tho. MAC DINH doc
 * sheet DAU TIEN trong file (giu tuong thich nguoc voi file chi co 1 sheet) -
 * neu file co NHIEU sheet va nguoi dung muon doc mot sheet KHAC (vd file gop
 * "Nhà số" + "Chi tiết nhân khẩu", can doc dung sheet "Chi tiết nhân khẩu"
 * cho Import nhan khau), truyen `sheetName` de chi dinh chinh xac - tim theo
 * TEN sheet (khong phai vi tri), nem loi ro rang neu khong tim thay. Luon tra
 * ve `availableSheetNames` (TAT CA ten sheet trong file, khong chi sheet duoc
 * doc) de caller luu lai va hien thi cho nguoi dung biet file co nhung sheet
 * nao, phong truong hop ho doc nham sheet (mac dinh) ma khong biet.
 */
function columnLetterToNumber(letters: string): number {
    let result = 0;
    for (const ch of letters) result = result * 26 + (ch.charCodeAt(0) - 64);
    return result;
}

/**
 * Tim cac dong bi gop o (merged cell) trai dai PHAN LON chieu rong sheet -
 * day la dau hieu cua dong banner/tieu de o dau file (vd dong ten to dan
 * pho) hoac dong tong cong o cuoi file (vd "TỔNG CỘNG" kem cong thuc SUM),
 * KHONG PHAI mot dong du lieu thuc su. Dua vao metadata merge that su cua
 * sheet (worksheet.model.merges) thay vi doan gia tri o o, vi dong tong
 * cong co the co mot cot khac gia tri (vd cong thuc SUM) nen khong the
 * phat hien chi bang cach so sanh noi dung cac o co giong het nhau khong.
 */
function getFullWidthMergedRows(worksheet: ExcelJS.Worksheet): Set<number> {
    const merges = (worksheet.model.merges as string[] | undefined) || [];
    const totalColumns = worksheet.columnCount || 1;
    const fullWidthRows = new Set<number>();
    for (const merge of merges) {
        const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(merge);
        if (!match) continue;
        const [, startColLetters, startRowStr, endColLetters, endRowStr] = match;
        if (startRowStr !== endRowStr) continue;
        const span =
            columnLetterToNumber(endColLetters) -
            columnLetterToNumber(startColLetters) +
            1;
        if (span >= totalColumns * 0.6) fullWidthRows.add(Number(startRowStr));
    }
    return fullWidthRows;
}

/**
 * Tim dong header thuc su trong sheet, bo qua cac dong banner bi gop o da
 * phat hien o tren. Quet tu dong 1, dong dau tien KHONG nam trong tap hop
 * do va co du lieu duoc coi la dong header thuc su.
 */
function findHeaderRowNumber(
    worksheet: ExcelJS.Worksheet,
    fullWidthMergedRows: Set<number>,
): number {
    const maxRowsToScan = Math.min(worksheet.rowCount || 1, 15);
    for (let rowNumber = 1; rowNumber <= maxRowsToScan; rowNumber++) {
        if (fullWidthMergedRows.has(rowNumber)) continue;
        const values: string[] = [];
        worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, cell => {
            const text = cellToString(cell.value).trim();
            if (text) values.push(text);
        });
        if (values.length === 0) continue;
        return rowNumber;
    }
    return 1;
}

async function readWorksheetRows(
    fileBuffer: Buffer,
    sheetName?: string,
): Promise<{
    headers: string[];
    rows: WorksheetRow[];
    availableSheetNames: string[];
    sourceSheetName: string;
}> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);

    const availableSheetNames = workbook.worksheets.map(w => w.name);

    let worksheet;
    if (sheetName) {
        worksheet = workbook.worksheets.find(w => w.name === sheetName);
        if (!worksheet) {
            throw new HttpError(
                `Không tìm thấy sheet "${sheetName}" trong file - file này có các sheet: ${availableSheetNames.join(", ") || "(không có)"}`,
                400,
            );
        }
    } else {
        worksheet = workbook.worksheets[0];
    }
    if (!worksheet) {
        throw new HttpError("File Excel không có sheet dữ liệu nào", 400);
    }

    const fullWidthMergedRows = getFullWidthMergedRows(worksheet);
    const headerRowNumber = findHeaderRowNumber(worksheet, fullWidthMergedRows);
    const headerRow = worksheet.getRow(headerRowNumber);
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
        if (rowNumber <= headerRowNumber) return;
        if (fullWidthMergedRows.has(rowNumber)) return;
        if (row.actualCellCount === 0) return;

        const values: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const header = headers[colNumber];
            if (header) values[header] = cell.value;
        });
        rows.push({ rowNumber, values });
    });

    return {
        headers: headers.filter(Boolean),
        rows,
        availableSheetNames,
        sourceSheetName: worksheet.name,
    };
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
    // KHONG phai cot trong file - admin nhap MOT LAN cho ca file (xem ghi chu
    // chi tiet o houseImportMappingSchema va commitHouseImport).
    defaultPassword?: string;
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
    sheetName?: string,
): Promise<IImportJob> {
    const { headers, rows, availableSheetNames, sourceSheetName } =
        await readWorksheetRows(fileBuffer, sheetName);

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
        availableSheetNames,
        sourceSheetName,
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
    // Thong tin cho nguoi dung biet dong nao se duoc "cap nhat bo sung" thay vi
    // tao moi (existingHouseId), tach rieng khoi rowErrors that su - xem ghi
    // chu IImportJob.skippedRows.
    const skipped: { row: number; message: string }[] = [];
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
        if (existingHouseId) {
            skipped.push({
                row: row.rowNumber,
                message: `Mã "${code}" đã tồn tại - sẽ cập nhật bổ sung thay vì tạo mới`,
            });
        }

        // "Phân khu/dãy" (subZone) la truong MO TA rieng, KHONG con duoc dung
        // lam cluster (RBAC/scoping) nua - de mot dong thieu subZone khong
        // bao gio bi tu choi vi ly do nay. cluster CHI đến tu "Cụm dân cư mặc
        // định" (mot gia tri duy nhat cho ca file, xem defaultCluster o tren)
        // - MOI nha moi tao trong lan import nay se dung CHUNG cluster nay.
        const cluster = defaultCluster;
        if (!existingHouseId && !cluster) {
            rowErrors.push(
                "Cần nhập 'Cụm dân cư mặc định cho cả file' để tạo nhà mới (file không có cột riêng cho cụm dân cư)",
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
            rowNumber: row.rowNumber,
            code,
            cluster: cluster || undefined,
            subZone: subZone || undefined,
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
    job.skippedRows = skipped;
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
        const subZone = row.subZone as string | undefined;
        const neighborhoodId = row.neighborhoodId as string | undefined;
        let changed = false;
        if (!houseRecord.note && note) {
            houseRecord.note = note;
            changed = true;
        }
        if (!houseRecord.subZone && subZone) {
            houseRecord.subZone = subZone;
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

// So dong xu ly giua moi lan ghi committedCount xuong DB trong luc commit
// (chay background) - can bang giua tan suat cap nhat progress cho frontend
// poll (xem getImportJobById) va so lan ghi DB khi import nhieu dong.
const IMPORT_PROGRESS_BATCH = 5;

export async function commitHouseImport(
    actorUser: IUser,
    importJobId: string,
): Promise<IImportJob> {
    const job = await ImportJob.findById(importJobId);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    if (job.type !== "house") {
        throw new HttpError("Import job này không phải loại nhà số", 400);
    }
    if (job.status === "committed" || job.status === "committing") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.status === "awaiting_mapping") {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu (mapping) trước khi commit",
            400,
        );
    }
    // Khong con chan commit chi vi co dong loi - nhung dong do se bi bo qua
    // (khong nhap), nguoi dung da duoc canh bao va xac nhan dieu nay o
    // frontend (xem ImportErrorConfirmDialog) truoc khi goi den day. Chi tu
    // choi khi KHONG co dong nao de xu ly (moi dong deu loi va khong co dong
    // nao trung du lieu de bo qua).
    if (job.previewData.length === 0 && job.skippedRows.length === 0) {
        throw new HttpError("Không có dòng dữ liệu hợp lệ nào để nhập", 400);
    }

    // Chuyen sang "committing" ngay va tra ve cho client de bat dau polling
    // tien do (xem getImportJobById) - vong lap ghi du lieu thuc su (co the
    // nhieu tram/nghin dong) chay o background (khong await response nay) de
    // tranh timeout HTTP khi import nhieu du lieu.
    job.status = "committing";
    job.committedCount = 0;
    await job.save();

    processHouseImportRows(String(job._id), actorUser).catch(async err => {
        await ImportJob.updateOne({ _id: job._id }, { status: "failed" });
        // eslint-disable-next-line no-console
        console.error(`[import] House job ${job._id} thất bại:`, err);
    });

    return job;
}

async function processHouseImportRows(
    jobId: string,
    actorUser: IUser,
): Promise<void> {
    const job = await ImportJob.findById(jobId);
    if (!job) return;

    // KHONG phai cot trong file - co/khong tick chon MOT LAN cho ca file luc
    // "chon cot" (xem applyHouseImportMapping) - luu trong columnMapping da
    // duoc job.save() o buoc do.
    const mappingOptions = job.columnMapping as HouseColumnMapping;
    const createHouseholds = mappingOptions?.createHouseholds === true;
    const defaultPassword = mappingOptions?.defaultPassword || undefined;

    let committedCount = 0;
    let housesCreated = 0;
    let housesMerged = 0;
    let householdsCreated = 0;
    let householdsUpdated = 0;
    let headCitizensCreated = 0;
    // Bat dau tu rowErrors da co san (loi phat hien luc preview) - cong don
    // them loi phat sinh luc commit (hiem, vd rang buoc DB) de "xem/xuat loi"
    // sau khi commit xong hien thi day du CA HAI nguon, khong chi rieng loi
    // preview - xem ghi chu IImportJob.rowErrors. Moi dong duoc boc try/catch
    // rieng - mot dong loi khong con lam hong ca job (khac truoc day).
    const commitErrors: { row: number; message: string }[] = [
        ...job.rowErrors,
    ];
    for (const row of job.previewData as Record<string, unknown>[]) {
        try {
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
                    subZone: row.subZone as string | undefined,
                    note: row.note as string | undefined,
                    neighborhoodId:
                        (row.neighborhoodId as string | undefined) ||
                        undefined,
                    ownerKind: hasOwner ? "individual" : "none",
                    createOwnerAccount: hasOwner,
                    owner: hasOwner
                        ? {
                              displayName: row.ownerName as string,
                              phone: row.ownerPhone as string,
                              password: defaultPassword,
                          }
                        : undefined,
                });
                housesCreated += 1;
            }

            // Tao/dien them Household lien ket qua houseId khi nguoi dung bat
            // tuy chon "Cũng tạo hộ dân" - CHI khi dong co ten chu ho
            // (headOfHousehold hoac ownerName, xem applyHouseImportMapping),
            // vi Household.headOfHousehold la truong bat buoc.
            const headOfHousehold = row.householdHeadOfHousehold as
                | string
                | undefined;
            if (createHouseholds && headOfHousehold) {
                // Nha da ton tai co the da co san Household (vd tu lan import
                // truoc) - CHI tao moi khi nha CHUA co Household nao; neu da
                // co dung 1 Household, chi dien vao truong dang trong (phone/
                // note), giong nguyen tac cua mergeIntoExistingHouse o tren.
                // Neu nha co NHIEU HON 1 Household (truong hop hiem, tao thu
                // cong) thi bo qua - khong ro nen dien vao Household nao.
                // eslint-disable-next-line no-await-in-loop
                const existingHouseholds = await Household.find({
                    houseId: houseRecord._id,
                }).select("status phone note");

                let household;
                if (existingHouseholds.length === 0) {
                    // eslint-disable-next-line no-await-in-loop
                    const householdCode = await generateSequentialCode(
                        Household,
                        "HB",
                        3,
                    );
                    // eslint-disable-next-line no-await-in-loop
                    household = await Household.create({
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
                    [household] = existingHouseholds;
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

                // Household (moi hoac da co san) phai co it nhat MOT Citizen
                // "Chủ hộ", giong bat bien cua householdService.createHousehold
                // - neu khong, chu ho se khong xuat hien trong danh sach nhan
                // khau cua ho dan (GET /households/:id/citizens chi doc tu
                // Citizen), va memberCount se luon thieu 1 so voi thuc te. Ap
                // dung CHO CA Household da ton tai tu lan import truoc (truoc
                // khi co doan code nay) MA DANG co 0 nhan khau - bat ke trang
                // thai xac thuc cua Household, vi day chi la BO SUNG du lieu
                // con thieu (khong phai sua truong da co san nhu phone/note o
                // tren) - chay lai (import lai) chinh file da dung se tu dong
                // bo sung chu ho con thieu cho ho dan da tao truoc do. Bo qua
                // neu nha co nhieu hon 1 Household (household la undefined
                // trong truong hop do) - cung ly do khong dien phone/note o
                // tren: khong ro nen bo sung vao Household nao.
                if (household) {
                    // eslint-disable-next-line no-await-in-loop
                    const citizenCount = await Citizen.countDocuments({
                        householdId: household._id,
                    });
                    if (citizenCount === 0) {
                        // eslint-disable-next-line no-await-in-loop
                        await Citizen.create({
                            fullName: headOfHousehold,
                            phone: row.householdPhone as string | undefined,
                            relationToHead: "Chủ hộ",
                            householdId: household._id,
                            createdBy: actorUser._id,
                            updatedBy: actorUser._id,
                        });
                        // eslint-disable-next-line no-await-in-loop
                        await Household.updateOne(
                            { _id: household._id },
                            { memberCount: 1 },
                        );
                        headCitizensCreated += 1;
                    }
                }
            }
        } catch (err) {
            commitErrors.push({
                row: row.rowNumber as number,
                message: (err as Error).message,
            });
        }
        committedCount += 1;

        if (committedCount % IMPORT_PROGRESS_BATCH === 0) {
            // eslint-disable-next-line no-await-in-loop
            await ImportJob.updateOne(
                { _id: jobId },
                {
                    committedCount,
                    createdCount: housesCreated,
                    skippedCount: housesMerged,
                    rowErrors: commitErrors,
                },
            );
        }
    }

    await ImportJob.updateOne(
        { _id: jobId },
        {
            status: "committed",
            committedCount,
            createdCount: housesCreated,
            skippedCount: housesMerged,
            rowErrors: commitErrors,
        },
    );

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: jobId,
        metadata: {
            type: "house",
            count: committedCount,
            housesCreated,
            housesMerged,
            householdsCreated,
            householdsUpdated,
            headCitizensCreated,
        },
    });
}

// ---------------------------------------------------------------------------
// Import ho dan
// ---------------------------------------------------------------------------

/**
 * File mau cho Import ho dan - khac House/Citizen/Street/Business, luong nay
 * CHUA nang cap sang "chon cot" (xem previewHouseholdImport) nen ten cot
 * trong file phai khop CHINH XAC voi HOUSEHOLD_COLUMNS (khong phan biet
 * hoa/thuong/dau).
 */
export function buildHouseholdImportTemplateWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Hộ dân");
    worksheet.columns = [
        { header: HOUSEHOLD_COLUMNS.cluster, key: "cluster", width: 18 },
        { header: HOUSEHOLD_COLUMNS.address, key: "address", width: 30 },
        {
            header: HOUSEHOLD_COLUMNS.headOfHousehold,
            key: "headOfHousehold",
            width: 22,
        },
        { header: HOUSEHOLD_COLUMNS.phone, key: "phone", width: 16 },
        {
            header: HOUSEHOLD_COLUMNS.ownershipType,
            key: "ownershipType",
            width: 16,
        },
        {
            header: HOUSEHOLD_COLUMNS.needsSupport,
            key: "needsSupport",
            width: 14,
        },
        { header: HOUSEHOLD_COLUMNS.note, key: "note", width: 24 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRow({
        cluster: "Dãy A",
        address: "Dãy A - CH-A101",
        headOfHousehold: "Nguyễn Văn A",
        phone: "0912345678",
        ownershipType: "Chính chủ",
        needsSupport: "Không",
        note: "",
    });
    worksheet.addRow({
        cluster: "Dãy A",
        address: "Dãy A - CH-A102",
        headOfHousehold: "Trần Thị B",
        phone: "0987654321",
        ownershipType: "Cho thuê",
        needsSupport: "Có",
        note: "Người cao tuổi sống một mình",
    });
    return workbook;
}

export async function previewHouseholdImport(
    actorId: string,
    fileBuffer: Buffer,
    fileName: string,
    sheetName?: string,
): Promise<IImportJob> {
    const { headers, rows, availableSheetNames, sourceSheetName } =
        await readWorksheetRows(fileBuffer, sheetName);
    const errors: { row: number; message: string }[] = [];
    const skipped: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    // Doi chieu "Cụm dân cư" + "Địa chỉ" (dong nhat mot don vi o thuc te, vd
    // "Dãy A - CH-A101") voi Household da co trong DB - dong trung se bi bo
    // qua (khong tao trung) thay vi tao them mot Household khac cho cung mot
    // dia chi, giong tinh than cua applyHouseImportMapping/
    // applyStreetImportMapping. Household khong co truong "code" nhap tay
    // (server tu sinh) nen day la khoa tu nhien duy nhat co the dung.
    const normalizeKey = (cluster: string, address: string) =>
        `${stripDiacritics(cluster).toLowerCase()}|${stripDiacritics(address).toLowerCase()}`;
    const existingHouseholds = await Household.find({}).select(
        "cluster address",
    );
    const existingKeys = new Set(
        existingHouseholds.map(h => normalizeKey(h.cluster, h.address)),
    );
    const seenKeys = new Set<string>();

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

        const key = normalizeKey(cluster, address);
        if (existingKeys.has(key) || seenKeys.has(key)) {
            skipped.push({
                row: row.rowNumber,
                message: `Hộ dân tại "${address}" (${cluster}) đã tồn tại`,
            });
            continue;
        }
        seenKeys.add(key);

        previewData.push({
            rowNumber: row.rowNumber,
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
        headers,
        rawRows: rows,
        availableSheetNames,
        sourceSheetName,
        rowErrors: errors,
        skippedRows: skipped,
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
    if (job.status === "committed" || job.status === "committing") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    // Khong con chan commit chi vi co dong loi - nhung dong do se bi bo qua
    // (khong nhap), nguoi dung da duoc canh bao va xac nhan dieu nay o
    // frontend (xem ImportErrorConfirmDialog) truoc khi goi den day. Chi tu
    // choi khi KHONG co dong nao de xu ly (moi dong deu loi va khong co dong
    // nao trung du lieu de bo qua).
    if (job.previewData.length === 0 && job.skippedRows.length === 0) {
        throw new HttpError("Không có dòng dữ liệu hợp lệ nào để nhập", 400);
    }

    job.status = "committing";
    job.committedCount = 0;
    await job.save();

    processHouseholdImportRows(String(job._id), actorId).catch(async err => {
        await ImportJob.updateOne({ _id: job._id }, { status: "failed" });
        // eslint-disable-next-line no-console
        console.error(`[import] Household job ${job._id} thất bại:`, err);
    });

    return job;
}

async function processHouseholdImportRows(
    jobId: string,
    actorId: string,
): Promise<void> {
    const job = await ImportJob.findById(jobId);
    if (!job) return;

    let committedCount = 0;
    let createdCount = 0;
    // Cac dong "da ton tai" (trung cụm+địa chỉ) da bi loai khoi previewData
    // ngay tu buoc preview (xem previewHouseholdImport) nen khong can xu ly gi
    // them o day - skippedCount lay thang tu skippedRows.length.
    const skippedCount = job.skippedRows.length;
    const commitErrors: { row: number; message: string }[] = [
        ...job.rowErrors,
    ];
    for (const row of job.previewData as Record<string, unknown>[]) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const code = await generateSequentialCode(Household, "HB", 3);
            // eslint-disable-next-line no-await-in-loop
            const household = await Household.create({
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
            // Ho dan phai co it nhat MOT Citizen "Chủ hộ" ngay khi tao (giong
            // bat bien cua householdService.createHousehold va
            // processHouseImportRows) - neu khong, chu ho se khong xuat hien
            // trong danh sach nhan khau cua ho dan nay, va memberCount se
            // luon thieu 1 so voi thuc te.
            // eslint-disable-next-line no-await-in-loop
            await Citizen.create({
                fullName: row.headOfHousehold,
                phone: row.phone,
                relationToHead: "Chủ hộ",
                householdId: household._id,
                createdBy: actorId,
                updatedBy: actorId,
            });
            // eslint-disable-next-line no-await-in-loop
            await Household.updateOne(
                { _id: household._id },
                { memberCount: 1 },
            );
            createdCount += 1;
        } catch (err) {
            commitErrors.push({
                row: row.rowNumber as number,
                message: (err as Error).message,
            });
        }
        committedCount += 1;
        if (committedCount % IMPORT_PROGRESS_BATCH === 0) {
            // eslint-disable-next-line no-await-in-loop
            await ImportJob.updateOne(
                { _id: jobId },
                { committedCount, createdCount, skippedCount, rowErrors: commitErrors },
            );
        }
    }

    await ImportJob.updateOne(
        { _id: jobId },
        {
            status: "committed",
            committedCount,
            createdCount,
            skippedCount,
            rowErrors: commitErrors,
        },
    );

    await writeAuditLog({
        actorId,
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: jobId,
        metadata: { type: "household", count: committedCount, createdCount, skippedCount },
    });
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
    occupation?: string;
    householdCode?: string;
    houseCode?: string;
    residenceType?: string;
    temporaryResidenceStartsAt?: string;
    temporaryResidenceExpiresAt?: string;
    isResidencyDeclared?: string;
    isUnemployed?: string;
    isElderly?: string;
    isChild?: string;
    isDisabledOrSupportNeeded?: string;
    isDisabledChild?: string;
    isPartyMember?: string;
    isUnionMember?: string;
    isMartyr?: string;
    isMartyrFamily?: string;
    isVeteran?: string;
    isOtherSpecial?: string;
    otherSpecialLabel?: string;
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
    "occupation",
    "householdCode",
    "houseCode",
    "residenceType",
    "temporaryResidenceStartsAt",
    "temporaryResidenceExpiresAt",
    "isResidencyDeclared",
    "isUnemployed",
    "isElderly",
    "isChild",
    "isDisabledOrSupportNeeded",
    "isDisabledChild",
    "isPartyMember",
    "isUnionMember",
    "isMartyr",
    "isMartyrFamily",
    "isVeteran",
    "isOtherSpecial",
    "otherSpecialLabel",
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
    sheetName?: string,
): Promise<IImportJob> {
    const { headers, rows, availableSheetNames, sourceSheetName } =
        await readWorksheetRows(fileBuffer, sheetName);

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
        availableSheetNames,
        sourceSheetName,
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

    // Doi chieu CCCD trung lap (voi DB va giua cac dong trong file) - CCCD la
    // khoa duy nhat dang tin cay duy nhat cho mot nguoi that, dung cccdHash de
    // tim kiem exact-match (xem hook pre("save") cua Citizen - cccd goc duoc
    // ma hoa nen khong the $regex/so sanh truc tiep). Dong khong co gia tri
    // CCCD (khong chon cot, hoac o rong) khong co khoa dang tin cay nen KHONG
    // bi doi chieu - luon la tao moi hoac loi hop le nhu truoc.
    const cccdHashesInFile = new Set<string>();
    if (mapping.cccd) {
        for (const row of rows) {
            const cccd = (row.values[mapping.cccd] || "").trim();
            if (cccd) cccdHashesInFile.add(hashForLookup(normalizeCccd(cccd)));
        }
    }
    const existingCitizensByCccd = mapping.cccd
        ? await Citizen.find({
              cccdHash: { $in: Array.from(cccdHashesInFile) },
          }).select("cccdHash")
        : [];
    const existingCccdHashes = new Set(
        existingCitizensByCccd.map(c => c.cccdHash),
    );
    const seenCccdHashes = new Set<string>();

    const errors: { row: number; message: string }[] = [];
    const skipped: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    for (const row of rows) {
        const v = row.values;
        const fullName = (v[mapping.fullName] || "").trim();
        const cccd = mapping.cccd ? (v[mapping.cccd] || "").trim() : "";
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

        // Bat buoc ca 2 ngay khi "tam_tru", giong yeu cau cua
        // createCitizenSchema (validators/citizen.ts) o luong tao thu cong.
        let temporaryResidenceStartsAt: Date | undefined;
        let temporaryResidenceExpiresAt: Date | undefined;
        if (residenceType === "tam_tru") {
            temporaryResidenceStartsAt = mapping.temporaryResidenceStartsAt
                ? parseDateCell(v[mapping.temporaryResidenceStartsAt])
                : undefined;
            temporaryResidenceExpiresAt = mapping.temporaryResidenceExpiresAt
                ? parseDateCell(v[mapping.temporaryResidenceExpiresAt])
                : undefined;
            if (!temporaryResidenceStartsAt) {
                rowErrors.push("Thiếu hoặc sai định dạng 'Ngày bắt đầu tạm trú'");
            }
            if (!temporaryResidenceExpiresAt) {
                rowErrors.push("Thiếu hoặc sai định dạng 'Ngày hết hạn tạm trú'");
            }
            if (
                temporaryResidenceStartsAt &&
                temporaryResidenceExpiresAt &&
                temporaryResidenceStartsAt > temporaryResidenceExpiresAt
            ) {
                rowErrors.push("Ngày bắt đầu tạm trú phải trước ngày hết hạn");
            }
        }

        if (rowErrors.length > 0) {
            errors.push({ row: row.rowNumber, message: rowErrors.join("; ") });
            continue;
        }

        if (cccd) {
            const cccdHash = hashForLookup(normalizeCccd(cccd));
            if (
                existingCccdHashes.has(cccdHash) ||
                seenCccdHashes.has(cccdHash)
            ) {
                skipped.push({
                    row: row.rowNumber,
                    message: `Nhân khẩu với CCCD "${cccd}" đã tồn tại`,
                });
                continue;
            }
            seenCccdHashes.add(cccdHash);
        }

        previewData.push({
            rowNumber: row.rowNumber,
            fullName,
            phone: mapping.phone ? (v[mapping.phone] || "").trim() || undefined : undefined,
            cccd: cccd || undefined,
            birthDate: mapping.birthDate
                ? parseDateCell(v[mapping.birthDate])?.toISOString()
                : undefined,
            gender,
            relationToHead: mapping.relationToHead
                ? (v[mapping.relationToHead] || "").trim() || undefined
                : undefined,
            occupation: mapping.occupation
                ? (v[mapping.occupation] || "").trim() || undefined
                : undefined,
            householdId,
            residenceType,
            temporaryResidenceStartsAt: temporaryResidenceStartsAt?.toISOString(),
            temporaryResidenceExpiresAt: temporaryResidenceExpiresAt?.toISOString(),
            isResidencyDeclared: mapping.isResidencyDeclared
                ? parseBoolean(v[mapping.isResidencyDeclared])
                : false,
            isUnemployed: mapping.isUnemployed
                ? parseBoolean(v[mapping.isUnemployed])
                : false,
            isElderly: mapping.isElderly
                ? parseBoolean(v[mapping.isElderly])
                : false,
            isChild: mapping.isChild ? parseBoolean(v[mapping.isChild]) : false,
            isDisabledOrSupportNeeded: mapping.isDisabledOrSupportNeeded
                ? parseBoolean(v[mapping.isDisabledOrSupportNeeded])
                : false,
            isDisabledChild: mapping.isDisabledChild
                ? parseBoolean(v[mapping.isDisabledChild])
                : false,
            isPartyMember: mapping.isPartyMember
                ? parseBoolean(v[mapping.isPartyMember])
                : false,
            isUnionMember: mapping.isUnionMember
                ? parseBoolean(v[mapping.isUnionMember])
                : false,
            isMartyr: mapping.isMartyr
                ? parseBoolean(v[mapping.isMartyr])
                : false,
            isMartyrFamily: mapping.isMartyrFamily
                ? parseBoolean(v[mapping.isMartyrFamily])
                : false,
            isVeteran: mapping.isVeteran
                ? parseBoolean(v[mapping.isVeteran])
                : false,
            isOtherSpecial: mapping.isOtherSpecial
                ? parseBoolean(v[mapping.isOtherSpecial])
                : false,
            otherSpecialLabel: mapping.otherSpecialLabel
                ? (v[mapping.otherSpecialLabel] || "").trim() || undefined
                : undefined,
        });
    }

    job.columnMapping = mapping;
    job.rowErrors = errors;
    job.skippedRows = skipped;
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
    if (job.status === "committed" || job.status === "committing") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.status === "awaiting_mapping") {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu (mapping) trước khi commit",
            400,
        );
    }
    // Khong con chan commit chi vi co dong loi - nhung dong do se bi bo qua
    // (khong nhap), nguoi dung da duoc canh bao va xac nhan dieu nay o
    // frontend (xem ImportErrorConfirmDialog) truoc khi goi den day. Chi tu
    // choi khi KHONG co dong nao de xu ly (moi dong deu loi va khong co dong
    // nao trung du lieu de bo qua).
    if (job.previewData.length === 0 && job.skippedRows.length === 0) {
        throw new HttpError("Không có dòng dữ liệu hợp lệ nào để nhập", 400);
    }

    job.status = "committing";
    job.committedCount = 0;
    await job.save();

    processCitizenImportRows(String(job._id), actorId).catch(async err => {
        await ImportJob.updateOne({ _id: job._id }, { status: "failed" });
        // eslint-disable-next-line no-console
        console.error(`[import] Citizen job ${job._id} thất bại:`, err);
    });

    return job;
}

async function processCitizenImportRows(
    jobId: string,
    actorId: string,
): Promise<void> {
    const job = await ImportJob.findById(jobId);
    if (!job) return;

    let committedCount = 0;
    let createdCount = 0;
    // Cac dong "da ton tai" (trung CCCD) da bi loai khoi previewData ngay tu
    // buoc mapping (xem applyCitizenImportMapping) nen khong can xu ly gi them
    // o day - skippedCount lay thang tu skippedRows.length.
    const skippedCount = job.skippedRows.length;
    const commitErrors: { row: number; message: string }[] = [
        ...job.rowErrors,
    ];
    // memberCount cua ho dan lien quan duoc +1 cho moi Citizen import thanh
    // cong - gom theo householdId roi cap nhat 1 lan bang bulkWrite (thay vi
    // recompute/update rieng le cho tung dong) de tranh O(n) update khi import
    // nhieu nhan khau cung luc.
    const memberCountDeltas = new Map<string, number>();
    // Ho dan can tinh lai hasDisabledChild/hasDisabledPerson - gom lai roi
    // recompute 1 lan cho moi ho dan sau vong lap (giong memberCountDeltas),
    // thay vi goi rieng le tung dong.
    const householdIdsNeedingFlagRecompute = new Set<string>();
    for (const row of job.previewData as Record<string, unknown>[]) {
        try {
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
                occupation: row.occupation,
                householdId: row.householdId,
                residenceType: row.residenceType,
                temporaryResidenceStartsAt: row.temporaryResidenceStartsAt
                    ? new Date(row.temporaryResidenceStartsAt as string)
                    : undefined,
                temporaryResidenceExpiresAt: row.temporaryResidenceExpiresAt
                    ? new Date(row.temporaryResidenceExpiresAt as string)
                    : undefined,
                isResidencyDeclared: !!row.isResidencyDeclared,
                isUnemployed: !!row.isUnemployed,
                isElderly: !!row.isElderly,
                isChild: !!row.isChild,
                isDisabledOrSupportNeeded: !!row.isDisabledOrSupportNeeded,
                isDisabledChild: !!row.isDisabledChild,
                isPartyMember: !!row.isPartyMember,
                isUnionMember: !!row.isUnionMember,
                isMartyr: !!row.isMartyr,
                isMartyrFamily: !!row.isMartyrFamily,
                isVeteran: !!row.isVeteran,
                isOtherSpecial: !!row.isOtherSpecial,
                otherSpecialLabel: row.otherSpecialLabel,
                createdBy: actorId,
                updatedBy: actorId,
            });
            createdCount += 1;
            if (row.householdId) {
                const key = String(row.householdId);
                memberCountDeltas.set(
                    key,
                    (memberCountDeltas.get(key) || 0) + 1,
                );
                if (row.isDisabledChild || row.isDisabledOrSupportNeeded) {
                    householdIdsNeedingFlagRecompute.add(key);
                }
            }
        } catch (err) {
            commitErrors.push({
                row: row.rowNumber as number,
                message: (err as Error).message,
            });
        }
        committedCount += 1;
        if (committedCount % IMPORT_PROGRESS_BATCH === 0) {
            // eslint-disable-next-line no-await-in-loop
            await ImportJob.updateOne(
                { _id: jobId },
                { committedCount, createdCount, skippedCount, rowErrors: commitErrors },
            );
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

    if (householdIdsNeedingFlagRecompute.size > 0) {
        await Promise.all(
            Array.from(householdIdsNeedingFlagRecompute).map(id =>
                recomputeHouseholdFlags(id),
            ),
        );
    }

    await ImportJob.updateOne(
        { _id: jobId },
        {
            status: "committed",
            committedCount,
            createdCount,
            skippedCount,
            rowErrors: commitErrors,
        },
    );

    await writeAuditLog({
        actorId,
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: jobId,
        metadata: { type: "citizen", count: committedCount, createdCount, skippedCount },
    });
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
 * File mau cho Import nha so - cac cot chi mang tinh goi y (buoc upload van
 * chap nhan bat ky ten cot nao, nguoi dung chon lai o buoc mapping), xem
 * HOUSE_COLUMNS/uploadHouseImportFile.
 */
export function buildHouseImportTemplateWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Nhà số");
    worksheet.columns = [
        { header: HOUSE_COLUMNS.code, key: "code", width: 16 },
        { header: HOUSE_COLUMNS.subZone, key: "subZone", width: 16 },
        { header: HOUSE_COLUMNS.ownerName, key: "ownerName", width: 22 },
        { header: HOUSE_COLUMNS.ownerPhone, key: "ownerPhone", width: 16 },
        {
            header: HOUSE_COLUMNS.headOfHousehold,
            key: "headOfHousehold",
            width: 22,
        },
        { header: HOUSE_COLUMNS.contactPhone, key: "contactPhone", width: 16 },
        { header: HOUSE_COLUMNS.usageType, key: "usageType", width: 18 },
        {
            header: HOUSE_COLUMNS.residenceStatus,
            key: "residenceStatus",
            width: 18,
        },
        { header: HOUSE_COLUMNS.hasBusiness, key: "hasBusiness", width: 14 },
        { header: HOUSE_COLUMNS.memberCount, key: "memberCount", width: 14 },
        { header: HOUSE_COLUMNS.landStatus, key: "landStatus", width: 18 },
        {
            header: HOUSE_COLUMNS.lotCodeCrossCheck,
            key: "lotCodeCrossCheck",
            width: 16,
        },
        { header: HOUSE_COLUMNS.note, key: "note", width: 24 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRow({
        code: "CH-A101",
        subZone: "Dãy A",
        ownerName: "Nguyễn Văn A",
        ownerPhone: "0912345678",
        headOfHousehold: "Nguyễn Văn A",
        contactPhone: "0912345678",
        usageType: "Để ở",
        residenceStatus: "Thường trú",
        hasBusiness: "Không",
        memberCount: "4",
        landStatus: "Đã cấp GCN",
        lotCodeCrossCheck: "Khớp",
        note: "",
    });
    worksheet.addRow({
        code: "CH-A102",
        subZone: "Dãy A",
        ownerName: "Trần Thị B",
        ownerPhone: "0987654321",
        headOfHousehold: "Trần Thị B (thuê)",
        contactPhone: "0987654321",
        usageType: "Để ở, Kinh doanh",
        residenceStatus: "Tạm trú",
        hasBusiness: "Có",
        memberCount: "2",
        landStatus: "Chưa cấp GCN",
        lotCodeCrossCheck: "Chưa đối chiếu",
        note: "Bán tạp hóa",
    });
    return workbook;
}

/**
 * File mau cho Import nhan khau - "Mã hộ" hoac "Mã căn/hộ" phai khop voi Ho
 * dan/Nha so DA TON TAI trong he thong (xem applyCitizenImportMapping), chi
 * dien MOT trong hai cot nay la du.
 */
export function buildCitizenImportTemplateWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Nhân khẩu");
    worksheet.columns = [
        { header: CITIZEN_COLUMNS.fullName, key: "fullName", width: 22 },
        { header: CITIZEN_COLUMNS.phone, key: "phone", width: 16 },
        { header: CITIZEN_COLUMNS.cccd, key: "cccd", width: 16 },
        { header: CITIZEN_COLUMNS.birthDate, key: "birthDate", width: 14 },
        { header: CITIZEN_COLUMNS.gender, key: "gender", width: 12 },
        {
            header: CITIZEN_COLUMNS.relationToHead,
            key: "relationToHead",
            width: 18,
        },
        { header: CITIZEN_COLUMNS.occupation, key: "occupation", width: 22 },
        { header: CITIZEN_COLUMNS.householdCode, key: "householdCode", width: 14 },
        { header: CITIZEN_COLUMNS.houseCode, key: "houseCode", width: 14 },
        {
            header: CITIZEN_COLUMNS.residenceType,
            key: "residenceType",
            width: 18,
        },
        {
            header: CITIZEN_COLUMNS.temporaryResidenceStartsAt,
            key: "temporaryResidenceStartsAt",
            width: 18,
        },
        {
            header: CITIZEN_COLUMNS.temporaryResidenceExpiresAt,
            key: "temporaryResidenceExpiresAt",
            width: 18,
        },
        {
            header: CITIZEN_COLUMNS.isResidencyDeclared,
            key: "isResidencyDeclared",
            width: 18,
        },
        {
            header: CITIZEN_COLUMNS.isUnemployed,
            key: "isUnemployed",
            width: 16,
        },
        { header: CITIZEN_COLUMNS.isElderly, key: "isElderly", width: 14 },
        { header: CITIZEN_COLUMNS.isChild, key: "isChild", width: 12 },
        {
            header: CITIZEN_COLUMNS.isDisabledOrSupportNeeded,
            key: "isDisabledOrSupportNeeded",
            width: 16,
        },
        {
            header: CITIZEN_COLUMNS.isDisabledChild,
            key: "isDisabledChild",
            width: 16,
        },
        {
            header: CITIZEN_COLUMNS.isPartyMember,
            key: "isPartyMember",
            width: 14,
        },
        {
            header: CITIZEN_COLUMNS.isUnionMember,
            key: "isUnionMember",
            width: 14,
        },
        { header: CITIZEN_COLUMNS.isMartyr, key: "isMartyr", width: 12 },
        {
            header: CITIZEN_COLUMNS.isMartyrFamily,
            key: "isMartyrFamily",
            width: 16,
        },
        { header: CITIZEN_COLUMNS.isVeteran, key: "isVeteran", width: 14 },
        {
            header: CITIZEN_COLUMNS.isOtherSpecial,
            key: "isOtherSpecial",
            width: 14,
        },
        {
            header: CITIZEN_COLUMNS.otherSpecialLabel,
            key: "otherSpecialLabel",
            width: 22,
        },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRow({
        fullName: "Nguyễn Văn A",
        phone: "0912345678",
        cccd: "001099001234",
        birthDate: "15/05/1985",
        gender: "Nam",
        relationToHead: "Chủ hộ",
        occupation: "Kỹ sư",
        householdCode: "HB001",
        houseCode: "",
        residenceType: "Thường trú",
        temporaryResidenceStartsAt: "",
        temporaryResidenceExpiresAt: "",
        isResidencyDeclared: "Có",
        isUnemployed: "Không",
        isElderly: "Không",
        isChild: "Không",
        isDisabledOrSupportNeeded: "Không",
        isDisabledChild: "Không",
        isPartyMember: "Không",
        isUnionMember: "Có",
        isMartyr: "Không",
        isMartyrFamily: "Không",
        isVeteran: "Có",
        isOtherSpecial: "Không",
        otherSpecialLabel: "",
    });
    worksheet.addRow({
        fullName: "Nguyễn Thị Bé",
        phone: "",
        cccd: "",
        birthDate: "20/03/2015",
        gender: "Nữ",
        relationToHead: "Con",
        occupation: "",
        householdCode: "HB001",
        houseCode: "",
        residenceType: "Tạm trú",
        temporaryResidenceStartsAt: "01/06/2026",
        temporaryResidenceExpiresAt: "01/12/2026",
        isResidencyDeclared: "Không",
        isUnemployed: "Không",
        isElderly: "Không",
        isChild: "Có",
        isDisabledOrSupportNeeded: "Không",
        isDisabledChild: "Có",
        isPartyMember: "Không",
        isUnionMember: "Không",
        isMartyr: "Không",
        isMartyrFamily: "Không",
        isVeteran: "Không",
        isOtherSpecial: "Có",
        otherSpecialLabel: "Hộ nghèo",
    });
    return workbook;
}

/**
 * File mau cho Import ho kinh doanh - "Mã nhà" phai khop voi Nha so DA TON
 * TAI trong he thong, "Loại hình kinh doanh" (neu co dien) phai khop voi mot
 * loai hinh da tao san (xem Quản lý > Loại hình kinh doanh).
 */
export function buildBusinessImportTemplateWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Hộ kinh doanh");
    worksheet.columns = [
        { header: BUSINESS_COLUMNS.name, key: "name", width: 26 },
        { header: BUSINESS_COLUMNS.houseCode, key: "houseCode", width: 14 },
        {
            header: BUSINESS_COLUMNS.businessTypeName,
            key: "businessTypeName",
            width: 20,
        },
        { header: BUSINESS_COLUMNS.ownerName, key: "ownerName", width: 22 },
        { header: BUSINESS_COLUMNS.taxCode, key: "taxCode", width: 16 },
        { header: BUSINESS_COLUMNS.phone, key: "phone", width: 16 },
        { header: BUSINESS_COLUMNS.active, key: "active", width: 18 },
        { header: BUSINESS_COLUMNS.note, key: "note", width: 24 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRow({
        name: "Tạp hóa Cô Ba",
        houseCode: "CH-A101",
        businessTypeName: "Bán lẻ",
        ownerName: "Nguyễn Văn A",
        taxCode: "",
        phone: "0912345678",
        active: "Đang hoạt động",
        note: "",
    });
    worksheet.addRow({
        name: "Quán ăn Hương Việt",
        houseCode: "CH-A102",
        businessTypeName: "Ăn uống",
        ownerName: "Trần Thị B",
        taxCode: "8012345678",
        phone: "0987654321",
        active: "Ngừng hoạt động",
        note: "Tạm nghỉ sửa chữa",
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
    sheetName?: string,
): Promise<IImportJob> {
    const { headers, rows, availableSheetNames, sourceSheetName } =
        await readWorksheetRows(fileBuffer, sheetName);

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
        availableSheetNames,
        sourceSheetName,
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
    // Trung ten/ma (voi DB hoac voi dong khac trong file) khong con bi coi la
    // loi/chan commit nhu truoc - chi bi bo qua (khong tao trung), tach rieng
    // khoi rowErrors that su - xem ghi chu IImportJob.skippedRows.
    const skipped: { row: number; message: string }[] = [];
    const previewData: Record<string, unknown>[] = [];

    for (const row of rows) {
        const name = (row.values[mapping.name] || "").trim();
        const codeInput = (mapping.code ? row.values[mapping.code] : "") || "";
        const active = mapping.active
            ? parseStreetActiveCell(row.values[mapping.active])
            : true;

        if (!name) {
            errors.push({ row: row.rowNumber, message: "Thiếu 'Tên đường/phố'" });
            continue;
        }

        const skipReasons: string[] = [];
        if (existingNames.has(name) || seenNames.has(name)) {
            skipReasons.push(`Tên đường/phố "${name}" đã tồn tại`);
        } else {
            seenNames.add(name);
        }

        let code = codeInput.trim();
        if (code) {
            if (existingCodes.has(code) || seenCodes.has(code)) {
                skipReasons.push(`Mã đường/phố "${code}" đã tồn tại`);
            } else {
                seenCodes.add(code);
            }
        }

        if (skipReasons.length > 0) {
            skipped.push({ row: row.rowNumber, message: skipReasons.join("; ") });
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

        previewData.push({ rowNumber: row.rowNumber, name, code, active });
    }

    job.columnMapping = mapping;
    job.rowErrors = errors;
    job.skippedRows = skipped;
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
    if (job.status === "committed" || job.status === "committing") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.status === "awaiting_mapping") {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu (mapping) trước khi commit",
            400,
        );
    }
    // Khong con chan commit chi vi co dong loi - nhung dong do se bi bo qua
    // (khong nhap), nguoi dung da duoc canh bao va xac nhan dieu nay o
    // frontend (xem ImportErrorConfirmDialog) truoc khi goi den day. Chi tu
    // choi khi KHONG co dong nao de xu ly (moi dong deu loi va khong co dong
    // nao trung du lieu de bo qua).
    if (job.previewData.length === 0 && job.skippedRows.length === 0) {
        throw new HttpError("Không có dòng dữ liệu hợp lệ nào để nhập", 400);
    }

    job.status = "committing";
    job.committedCount = 0;
    await job.save();

    processStreetImportRows(String(job._id), actorId).catch(async err => {
        await ImportJob.updateOne({ _id: job._id }, { status: "failed" });
        // eslint-disable-next-line no-console
        console.error(`[import] Street job ${job._id} thất bại:`, err);
    });

    return job;
}

async function processStreetImportRows(
    jobId: string,
    actorId: string,
): Promise<void> {
    const job = await ImportJob.findById(jobId);
    if (!job) return;

    let committedCount = 0;
    let createdCount = 0;
    // Cac dong "da ton tai" (trung ten/ma) da bi loai khoi previewData ngay tu
    // buoc mapping (xem applyStreetImportMapping) nen khong can xu ly gi them
    // o day - skippedCount lay thang tu skippedRows.length.
    const skippedCount = job.skippedRows.length;
    const commitErrors: { row: number; message: string }[] = [
        ...job.rowErrors,
    ];
    for (const row of job.previewData as Record<string, unknown>[]) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await Street.create({
                name: row.name,
                code: row.code,
                active: row.active,
                createdBy: actorId,
                updatedBy: actorId,
            });
            createdCount += 1;
        } catch (err) {
            commitErrors.push({
                row: row.rowNumber as number,
                message: (err as Error).message,
            });
        }
        committedCount += 1;
        if (committedCount % IMPORT_PROGRESS_BATCH === 0) {
            // eslint-disable-next-line no-await-in-loop
            await ImportJob.updateOne(
                { _id: jobId },
                { committedCount, createdCount, skippedCount, rowErrors: commitErrors },
            );
        }
    }

    await ImportJob.updateOne(
        { _id: jobId },
        {
            status: "committed",
            committedCount,
            createdCount,
            skippedCount,
            rowErrors: commitErrors,
        },
    );

    await writeAuditLog({
        actorId,
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: jobId,
        metadata: { type: "street", count: committedCount, createdCount, skippedCount },
    });
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
    sheetName?: string,
): Promise<IImportJob> {
    const { headers, rows, availableSheetNames, sourceSheetName } =
        await readWorksheetRows(fileBuffer, sheetName);

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
        availableSheetNames,
        sourceSheetName,
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
    // Trung ma so thue khong con bi coi la loi/chan commit nhu truoc - chi bi
    // bo qua (khong tao trung), tach rieng khoi rowErrors that su - xem ghi
    // chu IImportJob.skippedRows.
    const skipped: { row: number; message: string }[] = [];
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

        if (rowErrors.length > 0) {
            errors.push({ row: row.rowNumber, message: rowErrors.join("; ") });
            continue;
        }

        if (taxCode) {
            if (existingTaxCodes.has(taxCode) || seenTaxCodes.has(taxCode)) {
                skipped.push({
                    row: row.rowNumber,
                    message: `Mã số thuế "${taxCode}" đã tồn tại`,
                });
                continue;
            }
            seenTaxCodes.add(taxCode);
        }

        previewData.push({
            rowNumber: row.rowNumber,
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
    job.skippedRows = skipped;
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
    if (job.status === "committed" || job.status === "committing") {
        throw new HttpError("Import job này đã được commit trước đó", 400);
    }
    if (job.status === "awaiting_mapping") {
        throw new HttpError(
            "Vui lòng chọn cột dữ liệu (mapping) trước khi commit",
            400,
        );
    }
    // Khong con chan commit chi vi co dong loi - nhung dong do se bi bo qua
    // (khong nhap), nguoi dung da duoc canh bao va xac nhan dieu nay o
    // frontend (xem ImportErrorConfirmDialog) truoc khi goi den day. Chi tu
    // choi khi KHONG co dong nao de xu ly (moi dong deu loi va khong co dong
    // nao trung du lieu de bo qua).
    if (job.previewData.length === 0 && job.skippedRows.length === 0) {
        throw new HttpError("Không có dòng dữ liệu hợp lệ nào để nhập", 400);
    }

    job.status = "committing";
    job.committedCount = 0;
    await job.save();

    processBusinessImportRows(String(job._id), actorUser).catch(async err => {
        await ImportJob.updateOne({ _id: job._id }, { status: "failed" });
        // eslint-disable-next-line no-console
        console.error(`[import] Business job ${job._id} thất bại:`, err);
    });

    return job;
}

async function processBusinessImportRows(
    jobId: string,
    actorUser: IUser,
): Promise<void> {
    const job = await ImportJob.findById(jobId);
    if (!job) return;

    let committedCount = 0;
    let createdCount = 0;
    // Cac dong "da ton tai" (trung ma so thue) da bi loai khoi previewData
    // ngay tu buoc mapping (xem applyBusinessImportMapping) nen khong can xu
    // ly gi them o day - skippedCount lay thang tu skippedRows.length.
    const skippedCount = job.skippedRows.length;
    const commitErrors: { row: number; message: string }[] = [
        ...job.rowErrors,
    ];
    for (const row of job.previewData as Record<string, unknown>[]) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await createBusiness(actorUser, {
                name: row.name as string,
                houseId: row.houseId as string,
                businessType:
                    (row.businessTypeId as string | undefined) || null,
                ownerName: row.ownerName as string | undefined,
                taxCode: row.taxCode as string | undefined,
                phone: row.phone as string | undefined,
                active: row.active as boolean,
                note: row.note as string | undefined,
            });
            createdCount += 1;
        } catch (err) {
            commitErrors.push({
                row: row.rowNumber as number,
                message: (err as Error).message,
            });
        }
        committedCount += 1;
        if (committedCount % IMPORT_PROGRESS_BATCH === 0) {
            // eslint-disable-next-line no-await-in-loop
            await ImportJob.updateOne(
                { _id: jobId },
                { committedCount, createdCount, skippedCount, rowErrors: commitErrors },
            );
        }
    }

    await ImportJob.updateOne(
        { _id: jobId },
        {
            status: "committed",
            committedCount,
            createdCount,
            skippedCount,
            rowErrors: commitErrors,
        },
    );

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "import.commit",
        targetModel: "ImportJob",
        targetId: jobId,
        metadata: { type: "business", count: committedCount, createdCount, skippedCount },
    });
}

// ---------------------------------------------------------------------------
// Tien ich chung
// ---------------------------------------------------------------------------

export async function getImportJobById(id: string): Promise<IImportJob> {
    const job = await ImportJob.findById(id);
    if (!job) throw new HttpError("Không tìm thấy import job", 404);
    return job;
}

/**
 * Xuat TOAN BO rowErrors cua mot import job ra file Excel - dung chung cho ca
 * 5 loai import (khong can biet job.type, chi doc headers/rawRows/rowErrors
 * da co san tren IImportJob). Doi chieu lai gia tri goc cua dong qua rawRows
 * (theo rowNumber) de nguoi dung thay dung du lieu ho da nhap, khong chi ma
 * loi - job cu truoc khi co truong headers/rawRows (vd Household import truoc
 * ban nay) se chi hien duoc so dong + thong bao loi.
 */
export function buildImportErrorsWorkbook(job: IImportJob): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const headers = job.headers || [];
    const rawRowByNumber = new Map(
        (job.rawRows || []).map(r => [r.rowNumber, r.values]),
    );

    const columns: TableColumn[] = [
        { header: "Dòng", key: "__row", width: 10 },
        ...headers.map((header, idx) => ({
            header,
            key: `col${idx}`,
            width: 20,
        })),
        { header: "Lỗi", key: "__error", width: 50 },
    ];

    const rows = job.rowErrors.map(rowError => {
        const values = rawRowByNumber.get(rowError.row);
        const row: Record<string, unknown> = {
            __row: rowError.row,
            __error: rowError.message,
        };
        headers.forEach((header, idx) => {
            row[`col${idx}`] = values ? values[header] || "" : "";
        });
        return row;
    });

    addTableSheet(workbook, "Dòng lỗi", columns, rows);
    return workbook;
}
