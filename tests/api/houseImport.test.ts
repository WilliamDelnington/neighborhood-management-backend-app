import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { POST as uploadRoute } from "@/app/api/import/houses/route";
import { POST as commitRoute } from "@/app/api/import/houses/[jobId]/commit/route";
import { HouseRecord, User } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

const HOUSE_HEADERS = [
    "Mã căn/hộ",
    "Phân khu/dãy",
    "Chủ sở hữu đứng tên",
    "SĐT chủ sở hữu",
    "Chủ hộ/người đang sử dụng",
    "SĐT/Zalo liên hệ",
    "Loại hình sử dụng",
    "Tình trạng cư trú",
    "Có kinh doanh",
    "Số nhân khẩu",
    "Trạng thái đất",
    "Đối chiếu mã lô",
    "Ghi chú",
];

async function buildWorkbookFile(rows: unknown[][]): Promise<File> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Nhà số");
    sheet.addRow(HOUSE_HEADERS);
    rows.forEach(row => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return new File([buffer as unknown as BlobPart], "import-nha-so.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

async function upload(
    adminHeaders: Record<string, string>,
    rows: unknown[][],
    extra: { defaultCluster?: string; neighborhoodId?: string } = {},
) {
    const file = await buildWorkbookFile(rows);
    const formData = new FormData();
    formData.append("file", file);
    if (extra.defaultCluster) formData.append("defaultCluster", extra.defaultCluster);
    if (extra.neighborhoodId) formData.append("neighborhoodId", extra.neighborhoodId);
    const res = await uploadRoute(
        new Request("http://localhost/api/import/houses", {
            method: "POST",
            headers: adminHeaders,
            body: formData,
        }),
    );
    return readJson(res);
}

async function commit(adminHeaders: Record<string, string>, jobId: string) {
    const res = await commitRoute(
        makeRequest(`/api/import/houses/${jobId}/commit`, {
            method: "POST",
            headers: adminHeaders,
        }),
        { params: { jobId } },
    );
    return { res, json: await readJson(res) };
}

describe("Import Excel: nha so (House)", () => {
    it("dong day du (ten + sdt hop le) duoc gan hasOwner, ma duoc giu nguyen khong tu sinh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(adminHeaders, [
            [
                "H01-L19",
                "Lô 19",
                "Nguyễn Văn A",
                "0912345678",
                "Nguyễn Văn A",
                "0912345678",
                "Để ở",
                "Thường trú",
                "Không",
                4,
                "Đã cấp GCN",
                "Khớp",
                "Không có gì đặc biệt",
            ],
        ]);
        expect(uploadJson.data.status).toBe("validated");
        expect(uploadJson.data.rowErrors).toHaveLength(0);
        expect(uploadJson.data.previewData[0]).toMatchObject({
            code: "H01-L19",
            cluster: "Lô 19",
            ownerName: "Nguyễn Văn A",
            ownerPhone: "0912345678",
        });
        expect(uploadJson.data.previewData[0].note).toContain(
            "Số nhân khẩu: 4",
        );

        const { res, json } = await commit(adminHeaders, uploadJson.data._id);
        expect(res.status).toBe(200);
        expect(json.data.committedCount).toBe(1);

        const house = await HouseRecord.findOne({ code: "H01-L19" });
        expect(house).not.toBeNull();
        expect(house!.cluster).toBe("Lô 19");

        const owner = await User.findOne({ phone: "0912345678" });
        expect(owner).not.toBeNull();
        expect(owner!.roles).toContain("house_owner");
        expect(owner!.displayName).toBe("Nguyễn Văn A");
    });

    it("thieu 'Mã căn/hộ' bi bao loi va khong nam trong previewData", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(adminHeaders, [
            ["", "Lô 1", "", "", "", "", "", "", "", "", "", "", ""],
        ]);
        expect(uploadJson.data.status).toBe("previewing");
        expect(uploadJson.data.rowErrors).toHaveLength(1);
        expect(uploadJson.data.rowErrors[0].message).toContain("Mã căn/hộ");
        expect(uploadJson.data.previewData).toHaveLength(0);
    });

    it("trung 'Mã căn/hộ' trong cung file bi bao loi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(adminHeaders, [
            ["CH-A01", "Dãy A", "", "", "", "", "", "", "", "", "", "", ""],
            ["CH-A01", "Dãy A", "", "", "", "", "", "", "", "", "", "", ""],
        ]);
        expect(uploadJson.data.totalRows).toBe(2);
        expect(uploadJson.data.rowErrors).toHaveLength(1);
        expect(uploadJson.data.validRows).toBe(1);
    });

    it("trung 'Mã căn/hộ' voi House da co san trong DB bi bao loi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        await HouseRecord.create({
            code: "CH-B02",
            cluster: "Dãy B",
            address: "Dãy B - CH-B02",
            createdBy: admin._id,
            updatedBy: admin._id,
        });

        const uploadJson = await upload(adminHeaders, [
            ["CH-B02", "Dãy B", "", "", "", "", "", "", "", "", "", "", ""],
        ]);
        expect(uploadJson.data.rowErrors).toHaveLength(1);
        expect(uploadJson.data.rowErrors[0].message).toContain("đã tồn tại");
    });

    it("thieu 'Phân khu/dãy' nhung co cum mac dinh cho ca file thi van hop le", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(
            adminHeaders,
            [["CH-C03", "", "", "", "", "", "", "", "", "", "", "", ""]],
            { defaultCluster: "Cụm mặc định" },
        );
        expect(uploadJson.data.rowErrors).toHaveLength(0);
        expect(uploadJson.data.previewData[0].cluster).toBe("Cụm mặc định");
    });

    it("thieu 'Phân khu/dãy' va khong co cum mac dinh bi bao loi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(adminHeaders, [
            ["CH-D04", "", "", "", "", "", "", "", "", "", "", "", ""],
        ]);
        expect(uploadJson.data.rowErrors).toHaveLength(1);
        expect(uploadJson.data.rowErrors[0].message).toContain("cụm dân cư");
    });

    it("co ten chu so huu nhung SDT khong hop le -> khong tao tai khoan, khong bao loi ca dong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(adminHeaders, [
            [
                "CH-E05",
                "Dãy E",
                "Trần Thị B",
                "0123", // sdt khong hop le
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
            ],
        ]);
        expect(uploadJson.data.rowErrors).toHaveLength(0);
        expect(uploadJson.data.previewData[0].ownerName).toBeUndefined();
        expect(uploadJson.data.previewData[0].ownerPhone).toBeUndefined();

        const { json } = await commit(adminHeaders, uploadJson.data._id);
        expect(json.data.committedCount).toBe(1);
        const owners = await User.find({ displayName: "Trần Thị B" });
        expect(owners).toHaveLength(0);
        const house = await HouseRecord.findOne({ code: "CH-E05" });
        expect(house).not.toBeNull();
    });

    it("hai dong cung SDT chu so huu -> chi tao 1 tai khoan, tai su dung cho dong sau", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(adminHeaders, [
            [
                "CH-F06",
                "Dãy F",
                "Lê Văn C",
                "0987654321",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
            ],
            [
                "CH-F07",
                "Dãy F",
                "Lê Văn C",
                "0987654321",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
            ],
        ]);
        expect(uploadJson.data.rowErrors).toHaveLength(0);

        const { json } = await commit(adminHeaders, uploadJson.data._id);
        expect(json.data.committedCount).toBe(2);

        const owners = await User.find({ phone: "0987654321" });
        expect(owners).toHaveLength(1);

        const houses = await HouseRecord.find({
            code: { $in: ["CH-F06", "CH-F07"] },
        });
        expect(houses).toHaveLength(2);
    });

    it("khong the commit khi con loi, va khong the commit lai lan hai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const badUpload = await upload(adminHeaders, [
            ["", "Dãy G", "", "", "", "", "", "", "", "", "", "", ""],
        ]);
        const blockedCommit = await commit(adminHeaders, badUpload.data._id);
        expect(blockedCommit.res.status).toBe(400);

        const goodUpload = await upload(adminHeaders, [
            ["CH-G08", "Dãy G", "", "", "", "", "", "", "", "", "", "", ""],
        ]);
        const firstCommit = await commit(adminHeaders, goodUpload.data._id);
        expect(firstCommit.res.status).toBe(200);
        expect(firstCommit.json.data.committedCount).toBe(1);

        const secondCommit = await commit(adminHeaders, goodUpload.data._id);
        expect(secondCommit.res.status).toBe(400);

        const created = await HouseRecord.find({ code: "CH-G08" });
        expect(created).toHaveLength(1);
    });

    it("nguoi khong co quyen imports.manage bi tu choi (403)", async () => {
        const staff = await createTestUser({ roles: ["secretary"] });
        const staffHeaders = await authHeaders(staff);
        const file = await buildWorkbookFile([
            ["CH-H09", "Dãy H", "", "", "", "", "", "", "", "", "", "", ""],
        ]);
        const formData = new FormData();
        formData.append("file", file);
        const res = await uploadRoute(
            new Request("http://localhost/api/import/houses", {
                method: "POST",
                headers: staffHeaders,
                body: formData,
            }),
        );
        expect(res.status).toBe(403);
    });
});
