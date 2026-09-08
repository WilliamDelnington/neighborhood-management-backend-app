import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { Business, BusinessType } from "@/models";
import {
    uploadBusinessImportFile,
    applyBusinessImportMapping,
    commitBusinessImport,
    type BusinessColumnMapping,
} from "@/services/importService";
import {
    createTestUser,
    authHeaders,
    makeRequest,
    readJson,
    waitForImportJobSettled,
} from "../helpers";

/**
 * Kiem tra pipeline "Nhap ho kinh doanh tu Excel" (upload -> chon cot ->
 * commit) - dac biet la phan khac House import: houseCode phai khop mot nha
 * DA TON TAI (khong tu tao nha moi), businessTypeName phai khop mot
 * BusinessType da co, va taxCode phai duy nhat.
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

async function createHouse(adminHeaders: Record<string, string>, address: string) {
    const res = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers: adminHeaders,
            body: { cluster: "Cụm nhập Excel", address },
        }),
    );
    return (await readJson(res)).data;
}

describe("Import hộ kinh doanh từ Excel", () => {
    it("upload -> chọn cột -> commit tạo đúng hộ kinh doanh, gắn đúng nhà và loại hình", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const house = await createHouse(adminHeaders, "D04-L19, An Phú Shop Villa");
        const businessType = await BusinessType.create({ name: "Dịch vụ ăn uống" });

        const headers = [
            "Tên đơn vị",
            "Mã nhà",
            "Loại hình",
            "Chủ hộ",
            "MST",
            "SĐT",
        ];
        const buffer = await buildWorkbookBuffer(headers, [
            [
                "Quán ăn Cô Lan",
                house.code,
                "Dịch vụ ăn uống",
                "Nguyễn Thị Lan",
                "0111234567",
                "0900000111",
            ],
        ]);

        const uploaded = await uploadBusinessImportFile(
            String(admin._id),
            buffer,
            "test.xlsx",
        );
        expect(uploaded.status).toBe("awaiting_mapping");
        expect(uploaded.totalRows).toBe(1);

        const mapping: BusinessColumnMapping = {
            name: "Tên đơn vị",
            houseCode: "Mã nhà",
            businessTypeName: "Loại hình",
            ownerName: "Chủ hộ",
            taxCode: "MST",
            phone: "SĐT",
        };
        const mapped = await applyBusinessImportMapping(
            String(uploaded._id),
            mapping,
        );
        expect(mapped.rowErrors).toHaveLength(0);
        expect(mapped.validRows).toBe(1);
        expect(mapped.status).toBe("validated");
        const previewRow = mapped.previewData[0] as Record<string, unknown>;
        expect(previewRow.houseId).toBe(String(house._id));
        expect(previewRow.businessTypeId).toBe(String(businessType._id));

        await commitBusinessImport(admin, String(mapped._id));
        const committed = await waitForImportJobSettled(String(mapped._id));
        expect(committed.status).toBe("committed");
        expect(committed.committedCount).toBe(1);

        const created = await Business.findOne({ name: "Quán ăn Cô Lan" });
        expect(created).not.toBeNull();
        expect(String(created!.houseId)).toBe(String(house._id));
        expect(String(created!.businessType)).toBe(String(businessType._id));
        expect(created!.taxCode).toBe("0111234567");
        expect(created!.cluster).toBe(house.cluster);
    });

    it("báo lỗi dòng khi mã nhà không tồn tại, loại hình không khớp, hoặc mã số thuế trùng", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const house = await createHouse(await authHeaders(admin), "H01-L10, KĐT Dương Nội");
        await Business.create({
            name: "Hộ đã có sẵn",
            houseId: house._id,
            cluster: house.cluster,
            taxCode: "9999999999",
            status: "unverified",
        });

        const headers = ["Tên đơn vị", "Mã nhà", "Loại hình", "MST"];
        const buffer = await buildWorkbookBuffer(headers, [
            ["Hộ A", "MA_KHONG_TON_TAI", "", ""],
            ["Hộ B", house.code, "Loại hình không có thật", ""],
            ["Hộ C", house.code, "", "9999999999"],
        ]);

        const uploaded = await uploadBusinessImportFile(
            String(admin._id),
            buffer,
            "test-loi.xlsx",
        );
        const mapped = await applyBusinessImportMapping(String(uploaded._id), {
            name: "Tên đơn vị",
            houseCode: "Mã nhà",
            businessTypeName: "Loại hình",
            taxCode: "MST",
        });

        expect(mapped.validRows).toBe(0);
        expect(mapped.rowErrors).toHaveLength(3);
        expect(mapped.rowErrors[0].message).toMatch(/Không tìm thấy nhà số/);
        expect(mapped.rowErrors[1].message).toMatch(/Không tìm thấy loại hình kinh doanh/);
        expect(mapped.rowErrors[2].message).toMatch(/Mã số thuế .* đã tồn tại/);
    });
});
