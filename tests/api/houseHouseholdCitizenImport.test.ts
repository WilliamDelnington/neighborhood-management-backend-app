import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { Household, Citizen, HouseRecord } from "@/models";
import {
    uploadHouseImportFile,
    applyHouseImportMapping,
    commitHouseImport,
    uploadCitizenImportFile,
    applyCitizenImportMapping,
    commitCitizenImport,
    type HouseColumnMapping,
    type CitizenColumnMapping,
} from "@/services/importService";
import { createTestUser } from "../helpers";

/**
 * Kiem tra tuy chon "createHouseholds" moi cua Import nha so (tao them
 * Household lien ket qua houseId khi dong co ten chu ho), va pipeline Import
 * nhan khau da duoc nang cap tu bo nhan cot co dinh sang "chon cot" (giong
 * House/Business) voi kha nang lien ket qua "Mã căn/hộ" thay vi chi "Mã hộ" -
 * hai thay doi nay phuc vu cho viec nhap file "Danh sách hộ (tổng hợp)" +
 * "Chi tiết nhân khẩu (tổng hợp)" cua TDP Hoa Binh.
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

describe("Import nhà số kèm tạo hộ dân (createHouseholds)", () => {
    it("createHouseholds=true tạo House + Household liên kết, gắn ghi chú khi có tín hiệu kinh doanh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });

        const headers = ["Mã căn/hộ", "Phân khu/dãy", "Chủ hộ", "SĐT liên hệ", "Loại hình sử dụng"];
        const buffer = await buildWorkbookBuffer(headers, [
            ["H01-L19", "H (An Phú)", "Đỗ Mạnh Thắng", "0912797177", "Kinh doanh"],
            ["H01-L24", "H (An Phú)", "Hoàng Văn Tâm", "0985519481", "Ở gia đình"],
        ]);

        const uploaded = await uploadHouseImportFile(String(admin._id), buffer, "test.xlsx");
        const mapping: HouseColumnMapping = {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            headOfHousehold: "Chủ hộ",
            contactPhone: "SĐT liên hệ",
            usageType: "Loại hình sử dụng",
            createHouseholds: true,
        };
        const mapped = await applyHouseImportMapping(String(uploaded._id), mapping);
        expect(mapped.rowErrors).toHaveLength(0);

        const committed = await commitHouseImport(admin, String(mapped._id));
        expect(committed.status).toBe("committed");
        expect(committed.committedCount).toBe(2);

        const house1 = await HouseRecord.findOne({ code: "H01-L19" });
        const household1 = await Household.findOne({ houseId: house1!._id });
        expect(household1).not.toBeNull();
        expect(household1!.headOfHousehold).toBe("Đỗ Mạnh Thắng");
        expect(household1!.phone).toBe("0912797177");
        expect(household1!.note).toMatch(/kinh doanh/i);
        expect(household1!.memberCount).toBe(0);

        const house2 = await HouseRecord.findOne({ code: "H01-L24" });
        const household2 = await Household.findOne({ houseId: house2!._id });
        expect(household2).not.toBeNull();
        expect(household2!.note).toBeUndefined();
    });

    it("mặc định (không bật createHouseholds) chỉ tạo House, không tạo Household", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = ["Mã căn/hộ", "Phân khu/dãy", "Chủ hộ"];
        const buffer = await buildWorkbookBuffer(headers, [
            ["B06-L02", "An Vượng", "Nguyễn Hữu Đức Trung"],
        ]);

        const uploaded = await uploadHouseImportFile(String(admin._id), buffer, "test.xlsx");
        const mapped = await applyHouseImportMapping(String(uploaded._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            headOfHousehold: "Chủ hộ",
        });
        await commitHouseImport(admin, String(mapped._id));

        const house = await HouseRecord.findOne({ code: "B06-L02" });
        const household = await Household.findOne({ houseId: house!._id });
        expect(household).toBeNull();
    });
});

describe("Import nhân khẩu (chọn cột, liên kết qua Mã hộ hoặc Mã căn/hộ)", () => {
    async function createHouseWithHousehold(admin: Awaited<ReturnType<typeof createTestUser>>) {
        const uploaded = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy", "Chủ hộ"],
                [["Y01-L19", "Khu A", "Nguyễn Chiến Công"]],
            ),
            "house.xlsx",
        );
        const mapped = await applyHouseImportMapping(String(uploaded._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            headOfHousehold: "Chủ hộ",
            createHouseholds: true,
        });
        await commitHouseImport(admin, String(mapped._id));
        const house = await HouseRecord.findOne({ code: "Y01-L19" });
        const household = await Household.findOne({ houseId: house!._id });
        return { house: house!, household: household! };
    }

    it("liên kết qua 'Mã căn/hộ' khi nhà đã có đúng 1 hộ dân", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const { house, household } = await createHouseWithHousehold(admin);

        const headers = ["Họ và tên", "Mã căn/hộ", "Giới tính", "Quan hệ với chủ hộ"];
        const buffer = await buildWorkbookBuffer(headers, [
            ["Hồ Thị Thiên", house.code, "Nữ", "Vợ"],
        ]);

        const uploaded = await uploadCitizenImportFile(String(admin._id), buffer, "members.xlsx");
        expect(uploaded.status).toBe("awaiting_mapping");

        const mapping: CitizenColumnMapping = {
            fullName: "Họ và tên",
            houseCode: "Mã căn/hộ",
            gender: "Giới tính",
            relationToHead: "Quan hệ với chủ hộ",
        };
        const mapped = await applyCitizenImportMapping(String(uploaded._id), mapping);
        expect(mapped.rowErrors).toHaveLength(0);
        expect((mapped.previewData[0] as Record<string, unknown>).householdId).toBe(
            String(household._id),
        );

        const committed = await commitCitizenImport(String(admin._id), String(mapped._id));
        expect(committed.committedCount).toBe(1);

        const citizen = await Citizen.findOne({ fullName: "Hồ Thị Thiên" });
        expect(citizen).not.toBeNull();
        expect(String(citizen!.householdId)).toBe(String(household._id));

        const refreshed = await Household.findById(household._id);
        expect(refreshed!.memberCount).toBe(1);
    });

    it("báo lỗi khi mã nhà không có hộ dân, hoặc có nhiều hơn 1 hộ dân", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const { house } = await createHouseWithHousehold(admin);
        // Tao them mot Household thu hai cho cung nha nay -> "Mã căn/hộ" tro
        // nen mo ho, phai bao loi yeu cau dung "Mã hộ".
        await Household.create({
            code: "HB999",
            cluster: house.cluster,
            address: house.address,
            headOfHousehold: "Hộ thứ hai",
            houseId: house._id,
        });

        const headers = ["Họ và tên", "Mã căn/hộ"];
        const buffer = await buildWorkbookBuffer(headers, [
            ["Không tồn tại", "MA_KHONG_TON_TAI"],
            ["Nguyễn Văn A", house.code],
        ]);

        const uploaded = await uploadCitizenImportFile(String(admin._id), buffer, "members.xlsx");
        const mapped = await applyCitizenImportMapping(String(uploaded._id), {
            fullName: "Họ và tên",
            houseCode: "Mã căn/hộ",
        });

        expect(mapped.validRows).toBe(0);
        expect(mapped.rowErrors).toHaveLength(2);
        expect(mapped.rowErrors[0].message).toMatch(/Không tìm thấy nhà số/);
        expect(mapped.rowErrors[1].message).toMatch(/nhiều hộ dân/);
    });
});
