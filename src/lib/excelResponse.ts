import ExcelJS from "exceljs";

/**
 * Ghi workbook ExcelJS ra buffer va tra ve mot Response nhi phan (khong dung apiSuccess
 * vi day la file .xlsx, khong phai JSON envelope).
 */
export async function workbookToXlsxResponse(
    workbook: ExcelJS.Workbook,
    filename: string,
): Promise<Response> {
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
        headers: {
            "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
}

export type KeyValueRow = { label: string; value: unknown };

/**
 * Them mot sheet dang "Chi tieu / Gia tri" - dung cho cac bao cao dang tong hop
 * (population, finance...) khi khong co danh sach ban ghi ro rang.
 */
export function addSummarySheet(
    workbook: ExcelJS.Workbook,
    sheetName: string,
    rows: KeyValueRow[],
): ExcelJS.Worksheet {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = [
        { header: "Chỉ tiêu", key: "label", width: 40 },
        { header: "Giá trị", key: "value", width: 20 },
    ];
    worksheet.getRow(1).font = { bold: true };
    rows.forEach(row => worksheet.addRow(row));
    return worksheet;
}

export type TableColumn = { header: string; key: string; width?: number };

/**
 * Them mot sheet dang bang voi header tuy chinh - dung cho danh sach ban ghi
 * (theo cum dan cu, danh sach ho can khac phuc PCCC...).
 */
export function addTableSheet(
    workbook: ExcelJS.Workbook,
    sheetName: string,
    columns: TableColumn[],
    rows: Record<string, unknown>[],
): ExcelJS.Worksheet {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = columns;
    worksheet.getRow(1).font = { bold: true };
    rows.forEach(row => worksheet.addRow(row));
    return worksheet;
}
