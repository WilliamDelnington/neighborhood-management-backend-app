import ExcelJS from "exceljs";
import { Household, Citizen, ImportJob, type IImportJob } from "@/models";
import { HttpError } from "@/lib/response";
import { generateSequentialCode } from "@/lib/utils";
import { writeAuditLog } from "@/services/auditService";
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
// Import ho dan:
//   Cụm dân cư | Địa chỉ | Chủ hộ | Số điện thoại | Số nhân khẩu | Loại sở hữu
//   | Cần hỗ trợ | Ghi chú
//   - "Loại sở hữu" chap nhan "Chính chủ" / "Cho thuê" (khong phan biet hoa/thuong,
//     co the go co dau hoac khong dau, vd "chinh chu" cung hop le).
//   - "Cần hỗ trợ" chap nhan "Có"/"Không" hoac true/false/1/0, mac dinh Khong.
//
// Import nhan khau:
//   Họ tên | Số điện thoại | CCCD | Ngày sinh | Giới tính | Quan hệ với chủ hộ
//   | Mã hộ | Thường trú/Tạm trú | Người cao tuổi | Trẻ em | Người khuyết tật
//   | Đảng viên | Đoàn viên
//   - "Mã hộ" phai la ma ho da ton tai trong he thong (vd HB001), duoc doi chieu
//     truoc khi cho phep commit.
// ---------------------------------------------------------------------------

const HOUSEHOLD_COLUMNS = {
    cluster: "Cụm dân cư",
    address: "Địa chỉ",
    headOfHousehold: "Chủ hộ",
    phone: "Số điện thoại",
    memberCount: "Số nhân khẩu",
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
        throw new HttpError("File Excel khong co sheet du lieu nao", 400);
    }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        headers[colNumber] = cellToString(cell.value).trim();
    });

    if (headers.filter(Boolean).length === 0) {
        throw new HttpError(
            "Khong doc duoc dong tieu de (header) trong file Excel",
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
        const memberCountRaw = cellToString(
            v[HOUSEHOLD_COLUMNS.memberCount],
        ).trim();
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

        let memberCount = 0;
        if (memberCountRaw) {
            memberCount = Number(memberCountRaw);
            if (Number.isNaN(memberCount)) {
                rowErrors.push(
                    `Giá trị 'Số nhân khẩu' không phải là số: "${memberCountRaw}"`,
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
            memberCount,
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
    if (!job) throw new HttpError("Khong tim thay import job", 404);
    if (job.type !== "household") {
        throw new HttpError("Import job nay khong phai loai ho dan", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job nay da duoc commit truoc do", 400);
    }
    if (job.rowErrors.length > 0) {
        throw new HttpError(
            "Du lieu con loi, vui long sua va tao lai preview truoc khi commit",
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
            memberCount: row.memberCount,
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
    if (!job) throw new HttpError("Khong tim thay import job", 404);
    if (job.type !== "citizen") {
        throw new HttpError("Import job nay khong phai loai nhan khau", 400);
    }
    if (job.status === "committed") {
        throw new HttpError("Import job nay da duoc commit truoc do", 400);
    }
    if (job.rowErrors.length > 0) {
        throw new HttpError(
            "Du lieu con loi, vui long sua va tao lai preview truoc khi commit",
            400,
        );
    }

    let committedCount = 0;
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
// Tien ich chung
// ---------------------------------------------------------------------------

export async function getImportJobById(id: string): Promise<IImportJob> {
    const job = await ImportJob.findById(id);
    if (!job) throw new HttpError("Khong tim thay import job", 404);
    return job;
}
