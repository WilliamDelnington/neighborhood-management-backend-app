import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { Household, Citizen, HouseRecord, User } from "@/models";
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
import { createTestUser, waitForImportJobSettled } from "../helpers";

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
            defaultCluster: "Khu mặc định",
            headOfHousehold: "Chủ hộ",
            contactPhone: "SĐT liên hệ",
            usageType: "Loại hình sử dụng",
            createHouseholds: true,
        };
        const mapped = await applyHouseImportMapping(String(uploaded._id), mapping);
        expect(mapped.rowErrors).toHaveLength(0);

        await commitHouseImport(admin, String(mapped._id));
        const committed = await waitForImportJobSettled(String(mapped._id));
        expect(committed.status).toBe("committed");
        expect(committed.committedCount).toBe(2);

        const house1 = await HouseRecord.findOne({ code: "H01-L19" });
        const household1 = await Household.findOne({ houseId: house1!._id });
        expect(household1).not.toBeNull();
        expect(household1!.headOfHousehold).toBe("Đỗ Mạnh Thắng");
        expect(household1!.phone).toBe("0912797177");
        expect(household1!.note).toMatch(/kinh doanh/i);
        // Household phai co san 1 Citizen "Chủ hộ" ngay khi tao, khong con o
        // trang thai "0 nhan khau" nhu truoc.
        expect(household1!.memberCount).toBe(1);
        const headCitizen1 = await Citizen.findOne({ householdId: household1!._id });
        expect(headCitizen1).not.toBeNull();
        expect(headCitizen1!.fullName).toBe("Đỗ Mạnh Thắng");
        expect(headCitizen1!.phone).toBe("0912797177");
        expect(headCitizen1!.relationToHead).toBe("Chủ hộ");

        const house2 = await HouseRecord.findOne({ code: "H01-L24" });
        const household2 = await Household.findOne({ houseId: house2!._id });
        expect(household2).not.toBeNull();
        expect(household2!.note).toBeUndefined();
        expect(household2!.memberCount).toBe(1);
    });

    it("hộ dân đã tồn tại từ lần import trước nhưng có 0 nhân khẩu: import lại sẽ bổ sung Citizen 'Chủ hộ' còn thiếu (kịch bản HB061)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });

        // Gia lap ho dan da duoc tao boi PHIEN BAN CU cua tinh nang (truoc khi
        // co doan code bo sung Citizen "Chủ hộ") - Household ton tai nhung
        // khong co Citizen nao, giong dung hien trang HB061 nguoi dung bao cao.
        const house = await HouseRecord.create({
            code: "H01-L61",
            cluster: "H (An Phú)",
            address: "H (An Phú) - H01-L61",
            createdBy: admin._id,
            updatedBy: admin._id,
        });
        const staleHousehold = await Household.create({
            code: "HB061",
            cluster: house.cluster,
            address: house.address,
            headOfHousehold: "Bùi Văn Khánh",
            houseId: house._id,
            createdBy: admin._id,
            updatedBy: admin._id,
        });
        expect(await Citizen.countDocuments({ householdId: staleHousehold._id })).toBe(0);

        // Import lai CHINH file nha so nay voi createHouseholds=true.
        const uploaded = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy", "Chủ hộ"],
                [["H01-L61", "H (An Phú)", "Bùi Văn Khánh"]],
            ),
            "reimport.xlsx",
        );
        const mapped = await applyHouseImportMapping(String(uploaded._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            headOfHousehold: "Chủ hộ",
            createHouseholds: true,
        });
        expect(mapped.rowErrors).toHaveLength(0);
        await commitHouseImport(admin, String(mapped._id));
        await waitForImportJobSettled(String(mapped._id));

        // Van chi co 1 Household (khong tao trung ban thu hai).
        expect(await Household.countDocuments({ houseId: house._id })).toBe(1);
        const refreshedHousehold = await Household.findById(staleHousehold._id);
        expect(refreshedHousehold!.memberCount).toBe(1);

        const citizens = await Citizen.find({ householdId: staleHousehold._id });
        expect(citizens).toHaveLength(1);
        expect(citizens[0].fullName).toBe("Bùi Văn Khánh");
        expect(citizens[0].relationToHead).toBe("Chủ hộ");
    });

    it("hộ dân đã có sẵn ít nhất 1 nhân khẩu: import lại KHÔNG tạo thêm 'Chủ hộ' trùng lặp", async () => {
        const admin = await createTestUser({ roles: ["admin"] });

        const house = await HouseRecord.create({
            code: "Y01-L19",
            cluster: "Khu A",
            address: "Khu A - Y01-L19",
            createdBy: admin._id,
            updatedBy: admin._id,
        });
        const household = await Household.create({
            code: "HB070",
            cluster: house.cluster,
            address: house.address,
            headOfHousehold: "Nguyễn Chiến Công",
            houseId: house._id,
            memberCount: 1,
            createdBy: admin._id,
            updatedBy: admin._id,
        });
        await Citizen.create({
            fullName: "Nguyễn Chiến Công",
            relationToHead: "Chủ hộ",
            cccd: "001067008213",
            householdId: household._id,
            createdBy: admin._id,
            updatedBy: admin._id,
        });

        const uploaded = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy", "Chủ hộ"],
                [["Y01-L19", "Khu A", "Nguyễn Chiến Công"]],
            ),
            "reimport.xlsx",
        );
        const mapped = await applyHouseImportMapping(String(uploaded._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            headOfHousehold: "Chủ hộ",
            createHouseholds: true,
        });
        await commitHouseImport(admin, String(mapped._id));
        await waitForImportJobSettled(String(mapped._id));

        const citizens = await Citizen.find({ householdId: household._id });
        expect(citizens).toHaveLength(1); // khong them ban thu hai
        const refreshed = await Household.findById(household._id);
        expect(refreshed!.memberCount).toBe(1); // khong bi ghi de lai
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
            defaultCluster: "Khu mặc định",
            headOfHousehold: "Chủ hộ",
        });
        await commitHouseImport(admin, String(mapped._id));
        await waitForImportJobSettled(String(mapped._id));

        const house = await HouseRecord.findOne({ code: "B06-L02" });
        const household = await Household.findOne({ houseId: house!._id });
        expect(household).toBeNull();
    });
});

describe("Import nhà số kèm mật khẩu mặc định cho chủ nhà mới (defaultPassword)", () => {
    it("tài khoản chủ nhà mới tạo từ import được đặt defaultPassword và bắt buộc đổi mật khẩu", async () => {
        const admin = await createTestUser({ roles: ["admin"] });

        const headers = ["Mã căn/hộ", "Phân khu/dãy", "Chủ sở hữu đứng tên", "SĐT chủ sở hữu"];
        const buffer = await buildWorkbookBuffer(headers, [
            ["D01-L01", "Khu D", "Trần Văn Bình", "0966000111"],
        ]);

        const uploaded = await uploadHouseImportFile(String(admin._id), buffer, "test.xlsx");
        const mapping: HouseColumnMapping = {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            ownerName: "Chủ sở hữu đứng tên",
            ownerPhone: "SĐT chủ sở hữu",
            defaultPassword: "ImportDefault123",
        };
        const mapped = await applyHouseImportMapping(String(uploaded._id), mapping);
        expect(mapped.rowErrors).toHaveLength(0);
        await commitHouseImport(admin, String(mapped._id));
        await waitForImportJobSettled(String(mapped._id));

        const owner = await User.findOne({ phone: "0966000111" }).select("+passwordHash");
        expect(owner).not.toBeNull();
        expect(owner!.passwordHash).toBeDefined();
        expect(owner!.mustChangePassword).toBe(true);
    });

    it("không nhập defaultPassword: giữ nguyên hành vi cũ, tài khoản chủ nhà chưa có mật khẩu", async () => {
        const admin = await createTestUser({ roles: ["admin"] });

        const headers = ["Mã căn/hộ", "Phân khu/dãy", "Chủ sở hữu đứng tên", "SĐT chủ sở hữu"];
        const buffer = await buildWorkbookBuffer(headers, [
            ["D01-L02", "Khu D", "Lê Thị Cúc", "0966000222"],
        ]);

        const uploaded = await uploadHouseImportFile(String(admin._id), buffer, "test.xlsx");
        const mapped = await applyHouseImportMapping(String(uploaded._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            ownerName: "Chủ sở hữu đứng tên",
            ownerPhone: "SĐT chủ sở hữu",
        });
        await commitHouseImport(admin, String(mapped._id));
        await waitForImportJobSettled(String(mapped._id));

        const owner = await User.findOne({ phone: "0966000222" }).select("+passwordHash");
        expect(owner).not.toBeNull();
        expect(owner!.passwordHash).toBeUndefined();
        expect(owner!.mustChangePassword).toBe(false);
    });
});

describe("Import nhà số - dòng trùng 'Mã căn/hộ' với House đã có (merge, không ghi đè)", () => {
    it("nhà 'unverified' còn trống note/neighborhoodId: import lại điền vào chỗ trống, không tạo trùng House", async () => {
        const admin = await createTestUser({ roles: ["admin"] });

        const first = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy"],
                [["H01-L19", "H (An Phú)"]],
            ),
            "lan1.xlsx",
        );
        const firstMapped = await applyHouseImportMapping(String(first._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
        });
        await commitHouseImport(admin, String(firstMapped._id));
        await waitForImportJobSettled(String(firstMapped._id));
        const beforeCount = await HouseRecord.countDocuments({ code: "H01-L19" });
        expect(beforeCount).toBe(1);

        const second = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy", "Ghi chú"],
                [["H01-L19", "H (An Phú)", "Bổ sung từ đợt thu thập sau"]],
            ),
            "lan2.xlsx",
        );
        const secondMapped = await applyHouseImportMapping(String(second._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            note: "Ghi chú",
        });
        // Khong con bao loi "da ton tai" nua.
        expect(secondMapped.rowErrors).toHaveLength(0);
        expect(secondMapped.validRows).toBe(1);

        await commitHouseImport(admin, String(secondMapped._id));
        const committed = await waitForImportJobSettled(String(secondMapped._id));
        expect(committed.committedCount).toBe(1);

        const afterCount = await HouseRecord.countDocuments({ code: "H01-L19" });
        expect(afterCount).toBe(1); // van chi co 1 House, khong tao trung

        const house = await HouseRecord.findOne({ code: "H01-L19" });
        expect(house!.note).toBe("Ghi chú: Bổ sung từ đợt thu thập sau");
    });

    it("không ghi đè note đã có sẵn, và không sửa gì khi House đã 'verified'", async () => {
        const admin = await createTestUser({ roles: ["admin"] });

        const uploaded = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy", "Ghi chú"],
                [["H01-L24", "H (An Phú)", "Ghi chú gốc"]],
            ),
            "goc.xlsx",
        );
        const mapped = await applyHouseImportMapping(String(uploaded._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            note: "Ghi chú",
        });
        await commitHouseImport(admin, String(mapped._id));
        await waitForImportJobSettled(String(mapped._id));
        const house = await HouseRecord.findOne({ code: "H01-L24" });
        house!.status = "verified";
        await house!.save();

        const reImport = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy", "Ghi chú"],
                [["H01-L24", "H (An Phú)", "Ghi chú mới sẽ KHÔNG được áp dụng"]],
            ),
            "cap-nhat.xlsx",
        );
        const reMapped = await applyHouseImportMapping(String(reImport._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            note: "Ghi chú",
        });
        expect(reMapped.rowErrors).toHaveLength(0);
        await commitHouseImport(admin, String(reMapped._id));
        await waitForImportJobSettled(String(reMapped._id));

        const refreshed = await HouseRecord.findOne({ code: "H01-L24" });
        // note van la ghi chu goc - khong bi ghi de, va cung khong bi ghi de
        // boi "Ghi chú mới" du no dang trong vi status da "verified".
        expect(refreshed!.note).toBe("Ghi chú: Ghi chú gốc");
        expect(await HouseRecord.countDocuments({ code: "H01-L24" })).toBe(1);
    });

    it("nhà đã có sẵn 1 Household: import lại (createHouseholds=true) chỉ điền phone còn trống, không tạo Household thứ hai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });

        const first = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy", "Chủ hộ"],
                [["B06-L02", "An Vượng", "Nguyễn Hữu Đức Trung"]],
            ),
            "lan1.xlsx",
        );
        const firstMapped = await applyHouseImportMapping(String(first._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            headOfHousehold: "Chủ hộ",
            createHouseholds: true,
        });
        await commitHouseImport(admin, String(firstMapped._id));
        await waitForImportJobSettled(String(firstMapped._id));
        expect(await Household.countDocuments({})).toBe(1);
        const householdBefore = await Household.findOne({});
        expect(householdBefore!.phone).toBeUndefined();

        const second = await uploadHouseImportFile(
            String(admin._id),
            await buildWorkbookBuffer(
                ["Mã căn/hộ", "Phân khu/dãy", "Chủ hộ", "SĐT liên hệ"],
                [["B06-L02", "An Vượng", "Nguyễn Hữu Đức Trung", "0913345974"]],
            ),
            "lan2.xlsx",
        );
        const secondMapped = await applyHouseImportMapping(String(second._id), {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            defaultCluster: "Khu mặc định",
            headOfHousehold: "Chủ hộ",
            contactPhone: "SĐT liên hệ",
            createHouseholds: true,
        });
        await commitHouseImport(admin, String(secondMapped._id));
        await waitForImportJobSettled(String(secondMapped._id));

        expect(await Household.countDocuments({})).toBe(1); // van chi co 1
        const householdAfter = await Household.findOne({});
        expect(householdAfter!.phone).toBe("0913345974");
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
            defaultCluster: "Khu mặc định",
            headOfHousehold: "Chủ hộ",
            createHouseholds: true,
        });
        await commitHouseImport(admin, String(mapped._id));
        await waitForImportJobSettled(String(mapped._id));
        const house = await HouseRecord.findOne({ code: "Y01-L19" });
        const household = await Household.findOne({ houseId: house!._id });
        return { house: house!, household: household! };
    }

    it("liên kết qua 'Mã căn/hộ' khi nhà đã có đúng 1 hộ dân", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const { house, household } = await createHouseWithHousehold(admin);

        const headers = [
            "Họ và tên",
            "Mã căn/hộ",
            "Giới tính",
            "Quan hệ với chủ hộ",
            "Nghề nghiệp/nơi làm việc",
        ];
        const buffer = await buildWorkbookBuffer(headers, [
            ["Hồ Thị Thiên", house.code, "Nữ", "Vợ", "Nhân viên văn phòng"],
        ]);

        const uploaded = await uploadCitizenImportFile(String(admin._id), buffer, "members.xlsx");
        expect(uploaded.status).toBe("awaiting_mapping");

        const mapping: CitizenColumnMapping = {
            fullName: "Họ và tên",
            houseCode: "Mã căn/hộ",
            gender: "Giới tính",
            relationToHead: "Quan hệ với chủ hộ",
            occupation: "Nghề nghiệp/nơi làm việc",
        };
        const mapped = await applyCitizenImportMapping(String(uploaded._id), mapping);
        expect(mapped.rowErrors).toHaveLength(0);
        expect((mapped.previewData[0] as Record<string, unknown>).householdId).toBe(
            String(household._id),
        );
        expect((mapped.previewData[0] as Record<string, unknown>).occupation).toBe(
            "Nhân viên văn phòng",
        );

        await commitCitizenImport(String(admin._id), String(mapped._id));
        const committed = await waitForImportJobSettled(String(mapped._id));
        expect(committed.committedCount).toBe(1);

        const citizen = await Citizen.findOne({ fullName: "Hồ Thị Thiên" });
        expect(citizen).not.toBeNull();
        expect(String(citizen!.householdId)).toBe(String(household._id));
        expect(citizen!.occupation).toBe("Nhân viên văn phòng");

        const refreshed = await Household.findById(household._id);
        // 1 (Citizen "Chủ hộ" tu dong tao khi Household duoc tao - xem
        // createHouseWithHousehold) + 1 (Hồ Thị Thiên vua import) = 2.
        expect(refreshed!.memberCount).toBe(2);
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

    it("trùng CCCD với Citizen đã có sẵn (hoặc trùng trong cùng file): bị bỏ qua (không còn tạo trùng)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const { house, household } = await createHouseWithHousehold(admin);
        await Citizen.create({
            fullName: "Người đã có sẵn",
            cccd: "001099001234",
            householdId: household._id,
            createdBy: admin._id,
            updatedBy: admin._id,
        });

        const headers = ["Họ và tên", "Mã căn/hộ", "CCCD"];
        const buffer = await buildWorkbookBuffer(headers, [
            // Trung CCCD voi Citizen da co san trong DB.
            ["Trùng với DB", house.code, "001099001234"],
            // Trung CCCD voi dong khac trong CUNG file (dong sau bi bo qua).
            ["Người mới A", house.code, "001099005678"],
            ["Trùng trong file", house.code, "001099005678"],
        ]);

        const uploaded = await uploadCitizenImportFile(String(admin._id), buffer, "members.xlsx");
        const mapped = await applyCitizenImportMapping(String(uploaded._id), {
            fullName: "Họ và tên",
            houseCode: "Mã căn/hộ",
            cccd: "CCCD",
        });

        expect(mapped.rowErrors).toHaveLength(0);
        expect(mapped.skippedRows).toHaveLength(2);
        expect(mapped.validRows).toBe(1);

        await commitCitizenImport(String(admin._id), String(mapped._id));
        const committed = await waitForImportJobSettled(String(mapped._id));
        expect(committed.createdCount).toBe(1);
        expect(committed.skippedCount).toBe(2);

        // Van chi co 1 Citizen cho moi CCCD (khong tao trung).
        const created = await Citizen.find({ fullName: "Người mới A" });
        expect(created).toHaveLength(1);
        expect(
            await Citizen.countDocuments({ householdId: household._id }),
        ).toBe(3); // "Chủ hộ" tu dong tao khi lap Household + "Người đã có sẵn" + "Người mới A"
    });
});
