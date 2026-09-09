import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { Household, Citizen } from "@/models";
import {
    previewHouseholdImport,
    commitHouseholdImport,
} from "@/services/importService";
import { createTestUser, waitForImportJobSettled } from "../helpers";

/**
 * Kiem tra pipeline "Nhap ho dan tu Excel" (previewHouseholdImport ->
 * commitHouseholdImport) - dac biet la doi chieu trung "Cụm dân cư" + "Địa
 * chỉ" voi Household da co (bo qua, khong tao trung) va commit khong con bi
 * chan hoan toan khi file co dong loi (chi bo qua dong do).
 */

async function buildWorkbookBuffer(
    headers: string[],
    rows: (string | number)[][],
): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data");
    worksheet.addRow(headers);
    rows.forEach(row => worksheet.addRow(row));
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}

const HOUSEHOLD_HEADERS = [
    "Cụm dân cư",
    "Địa chỉ",
    "Chủ hộ",
    "SĐT",
    "Loại sở hữu",
    "Cần hỗ trợ",
    "Ghi chú",
];

describe("Import hộ dân từ Excel", () => {
    it("upload -> preview -> commit tạo đúng hộ dân kèm Citizen 'Chủ hộ'", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const buffer = await buildWorkbookBuffer(HOUSEHOLD_HEADERS, [
            [
                "Dãy A",
                "Dãy A - CH-A101",
                "Nguyễn Văn A",
                "0912345678",
                "Chính chủ",
                "Không",
                "",
            ],
        ]);

        const job = await previewHouseholdImport(
            String(admin._id),
            buffer,
            "test.xlsx",
        );
        expect(job.status).toBe("validated");
        expect(job.rowErrors).toHaveLength(0);
        expect(job.skippedRows).toHaveLength(0);
        expect(job.validRows).toBe(1);

        await commitHouseholdImport(String(admin._id), String(job._id));
        const committed = await waitForImportJobSettled(String(job._id));
        expect(committed.status).toBe("committed");
        expect(committed.createdCount).toBe(1);
        expect(committed.skippedCount).toBe(0);

        const household = await Household.findOne({
            address: "Dãy A - CH-A101",
        });
        expect(household).not.toBeNull();
        expect(household!.memberCount).toBe(1);
        const headCitizen = await Citizen.findOne({
            householdId: household!._id,
        });
        expect(headCitizen).not.toBeNull();
        expect(headCitizen!.relationToHead).toBe("Chủ hộ");
    });

    it("trùng 'Cụm dân cư' + 'Địa chỉ' với Household đã có sẵn: bị bỏ qua (không còn là lỗi)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        await Household.create({
            code: "HB001",
            cluster: "Dãy A",
            address: "Dãy A - CH-A101",
            headOfHousehold: "Hộ đã có sẵn",
            createdBy: admin._id,
            updatedBy: admin._id,
        });

        const buffer = await buildWorkbookBuffer(HOUSEHOLD_HEADERS, [
            [
                "Dãy A",
                "Dãy A - CH-A101",
                "Nguyễn Văn A",
                "0912345678",
                "Chính chủ",
                "Không",
                "",
            ],
            [
                "Dãy A",
                "Dãy A - CH-A102",
                "Trần Thị B",
                "0987654321",
                "Cho thuê",
                "Không",
                "",
            ],
        ]);

        const job = await previewHouseholdImport(
            String(admin._id),
            buffer,
            "test.xlsx",
        );
        expect(job.rowErrors).toHaveLength(0);
        expect(job.skippedRows).toHaveLength(1);
        expect(job.skippedRows[0].message).toContain("đã tồn tại");
        expect(job.validRows).toBe(1);

        await commitHouseholdImport(String(admin._id), String(job._id));
        const committed = await waitForImportJobSettled(String(job._id));
        expect(committed.createdCount).toBe(1);
        expect(committed.skippedCount).toBe(1);
        // Van chi co 1 Household cho dia chi trung (khong tao them ban thu hai).
        expect(
            await Household.countDocuments({ address: "Dãy A - CH-A101" }),
        ).toBe(1);
        expect(
            await Household.countDocuments({ address: "Dãy A - CH-A102" }),
        ).toBe(1);
    });

    it("commit KHÔNG còn bị chặn hoàn toàn khi file có dòng lỗi - chỉ dòng đó bị bỏ qua", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const buffer = await buildWorkbookBuffer(HOUSEHOLD_HEADERS, [
            ["", "Thiếu cụm dân cư", "Chủ hộ lỗi", "", "", "", ""],
            [
                "Dãy B",
                "Dãy B - CH-B201",
                "Lê Văn C",
                "",
                "Chính chủ",
                "Không",
                "",
            ],
        ]);

        const job = await previewHouseholdImport(
            String(admin._id),
            buffer,
            "test.xlsx",
        );
        expect(job.rowErrors).toHaveLength(1);
        expect(job.validRows).toBe(1);
        expect(job.status).toBe("previewing");

        // Truoc day: commit se bi tu choi (400) vi con dong loi. Gio commit
        // van chay, chi bo qua dong loi.
        const commitResult = await commitHouseholdImport(
            String(admin._id),
            String(job._id),
        );
        expect(commitResult.status).toBe("committing");
        const committed = await waitForImportJobSettled(String(job._id));
        expect(committed.status).toBe("committed");
        expect(committed.createdCount).toBe(1);
        expect(
            await Household.countDocuments({ address: "Dãy B - CH-B201" }),
        ).toBe(1);
    });
});
