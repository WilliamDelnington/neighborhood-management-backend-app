import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { uploadCitizenImportFile } from "@/services/importService";
import { createTestUser } from "../helpers";

/**
 * Kiem tra fix "doc nham sheet" - readWorksheetRows truoc day luon doc
 * worksheets[0] (sheet DAU TIEN theo vi tri), bat ke ten sheet, nen file gop
 * nhieu sheet (vd "Nhà số" sheet dau + "Chi tiết nhân khẩu" sheet sau) se bi
 * Import nhan khau doc NHAM sheet "Nhà số" thay vi sheet nhan khau. Gio da co
 * tham so sheetName de chi dinh dung sheet can doc.
 */

async function buildTwoSheetWorkbookBuffer(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const houseSheet = workbook.addWorksheet("Nhà số");
    houseSheet.addRow(["Mã căn/hộ", "Phân khu/dãy", "Chủ hộ"]);
    houseSheet.addRow(["H01-L19", "Khu A", "Đỗ Mạnh Thắng"]);

    const citizenSheet = workbook.addWorksheet("Chi tiết nhân khẩu");
    citizenSheet.addRow(["Họ và tên", "Mã căn/hộ", "Giới tính"]);
    citizenSheet.addRow(["Hồ Thị Thiên", "H01-L19", "Nữ"]);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}

describe("Import Excel - chọn đúng sheet khi file có nhiều sheet", () => {
    it("mặc định (không truyền sheetName) đọc sheet ĐẦU TIÊN, và báo cáo đủ danh sách sheet có trong file", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const buffer = await buildTwoSheetWorkbookBuffer();

        const job = await uploadCitizenImportFile(
            String(admin._id),
            buffer,
            "gop.xlsx",
        );

        expect(job.sourceSheetName).toBe("Nhà số");
        expect(job.availableSheetNames).toEqual(["Nhà số", "Chi tiết nhân khẩu"]);
        // Doc nham sheet "Nhà số" nen headers la cot cua House, KHONG phai
        // cot nhan khau - minh chung ro cho bug truoc khi co sheetName.
        expect(job.headers).toContain("Mã căn/hộ");
        expect(job.headers).not.toContain("Họ và tên");
    });

    it("truyền đúng sheetName 'Chi tiết nhân khẩu' thì đọc đúng sheet đó", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const buffer = await buildTwoSheetWorkbookBuffer();

        const job = await uploadCitizenImportFile(
            String(admin._id),
            buffer,
            "gop.xlsx",
            "Chi tiết nhân khẩu",
        );

        expect(job.sourceSheetName).toBe("Chi tiết nhân khẩu");
        expect(job.availableSheetNames).toEqual(["Nhà số", "Chi tiết nhân khẩu"]);
        expect(job.headers).toContain("Họ và tên");
        expect(job.headers).not.toContain("Chủ hộ");
    });

    it("truyền sheetName không tồn tại thì báo lỗi rõ ràng kèm danh sách sheet có trong file", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const buffer = await buildTwoSheetWorkbookBuffer();

        await expect(
            uploadCitizenImportFile(
                String(admin._id),
                buffer,
                "gop.xlsx",
                "Sheet không tồn tại",
            ),
        ).rejects.toThrow(/Không tìm thấy sheet/);
    });
});
