import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { POST as uploadRoute } from "@/app/api/import/houses/route";
import { PUT as mappingRoute } from "@/app/api/import/houses/[jobId]/mapping/route";
import { POST as commitRoute } from "@/app/api/import/houses/[jobId]/commit/route";
import { HouseRecord, User } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function buildWorkbookFile(
    headers: string[],
    rows: unknown[][],
): Promise<File> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Nhà số");
    sheet.addRow(headers);
    rows.forEach(row => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return new File([buffer as unknown as BlobPart], "import-nha-so.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

async function upload(
    adminHeaders: Record<string, string>,
    headers: string[],
    rows: unknown[][],
) {
    const file = await buildWorkbookFile(headers, rows);
    const formData = new FormData();
    formData.append("file", file);
    const res = await uploadRoute(
        new Request("http://localhost/api/import/houses", {
            method: "POST",
            headers: adminHeaders,
            body: formData,
        }),
    );
    return readJson(res);
}

async function applyMapping(
    adminHeaders: Record<string, string>,
    jobId: string,
    mapping: Record<string, string>,
) {
    const res = await mappingRoute(
        makeRequest(`/api/import/houses/${jobId}/mapping`, {
            method: "PUT",
            headers: adminHeaders,
            body: mapping,
        }),
        { params: { jobId } },
    );
    return { res, json: await readJson(res) };
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

// Header "la" cua he thong - dung de kiem tra goi y mapping tu dong khop.
const CANONICAL_HEADERS = [
    "Mã căn/hộ",
    "Phân khu/dãy",
    "Chủ sở hữu đứng tên",
    "SĐT chủ sở hữu",
];

describe("Import Excel: nha so (House)", () => {
    it("upload nhan dien dung header va goi y mapping khi nhan cot khop mac dinh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(
            adminHeaders,
            CANONICAL_HEADERS,
            [["H01-L19", "Lô 19", "Nguyễn Văn A", "0912345678"]],
        );
        expect(uploadJson.data.status).toBe("awaiting_mapping");
        expect(uploadJson.data.headers).toEqual(CANONICAL_HEADERS);
        expect(uploadJson.data.suggestedMapping).toMatchObject({
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            ownerName: "Chủ sở hữu đứng tên",
            ownerPhone: "SĐT chủ sở hữu",
        });
        expect(uploadJson.data.previewData).toHaveLength(0);
    });

    it("upload voi header tuy y (khac ten cong ty/to dan pho khac) -> khong goi y duoc mapping, phai chon cot thu cong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(
            adminHeaders,
            ["Unit code", "Zone", "Owner name", "Owner phone"],
            [["CH-A01", "Zone A", "Lê Thị B", "0909111222"]],
        );
        expect(uploadJson.data.suggestedMapping).toEqual({});

        const { res, json } = await applyMapping(
            adminHeaders,
            uploadJson.data._id,
            {
                code: "Unit code",
                subZone: "Zone",
                ownerName: "Owner name",
                ownerPhone: "Owner phone",
            },
        );
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("validated");
        expect(json.data.previewData[0]).toMatchObject({
            code: "CH-A01",
            cluster: "Zone A",
            ownerName: "Lê Thị B",
            ownerPhone: "0909111222",
        });
    });

    it("chi chon cot 'Mã căn/hộ', bo qua cac cot con lai -> van hop le, khong co chu nha", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(
            adminHeaders,
            ["Mã", "Ghi chú không dùng"],
            [["CH-B02", "bỏ qua"]],
        );

        const { res, json } = await applyMapping(
            adminHeaders,
            uploadJson.data._id,
            { code: "Mã", defaultCluster: "Cụm mặc định" },
        );
        expect(res.status).toBe(200);
        expect(json.data.rowErrors).toHaveLength(0);
        expect(json.data.previewData[0]).toMatchObject({
            code: "CH-B02",
            cluster: "Cụm mặc định",
        });
        expect(json.data.previewData[0].ownerName).toBeUndefined();
        expect(json.data.previewData[0].ownerPhone).toBeUndefined();
    });

    it("thieu mapping cho 'Mã căn/hộ' bi tu choi (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ"],
            [["CH-C03"]],
        );

        const { res } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "",
        });
        expect(res.status).toBe(422);
    });

    it("chon cot khong ton tai trong file bi tu choi (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ"],
            [["CH-D04"]],
        );

        const { res } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Cột không tồn tại",
        });
        expect(res.status).toBe(422);
    });

    it("chon cung mot cot cho hai truong khac nhau bi tu choi (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Cột duy nhất"],
            [["CH-E05"]],
        );

        const { res } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Cột duy nhất",
            subZone: "Cột duy nhất",
        });
        expect(res.status).toBe(422);
    });

    it("dong thieu 'Mã căn/hộ' (sau khi chon cot) bi bao loi va khong dua vao previewData", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ", "Phân khu/dãy"],
            [["", "Dãy X"]],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
        });
        expect(json.data.status).toBe("previewing");
        expect(json.data.rowErrors).toHaveLength(1);
        expect(json.data.rowErrors[0].message).toContain("Mã căn/hộ");
        expect(json.data.previewData).toHaveLength(0);
    });

    it("trung 'Mã căn/hộ' trong cung file bi bao loi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ", "Phân khu/dãy"],
            [
                ["CH-F06", "Dãy F"],
                ["CH-F06", "Dãy F"],
            ],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
        });
        expect(json.data.totalRows).toBe(2);
        expect(json.data.rowErrors).toHaveLength(1);
        expect(json.data.validRows).toBe(1);
    });

    it("trung 'Mã căn/hộ' voi House da co san trong DB bi bao loi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        await HouseRecord.create({
            code: "CH-G07",
            cluster: "Dãy G",
            address: "Dãy G - CH-G07",
            createdBy: admin._id,
            updatedBy: admin._id,
        });

        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ", "Phân khu/dãy"],
            [["CH-G07", "Dãy G"]],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
        });
        expect(json.data.rowErrors).toHaveLength(1);
        expect(json.data.rowErrors[0].message).toContain("đã tồn tại");
    });

    it("khong chon cot 'Phân khu/dãy' va khong nhap cum mac dinh bi bao loi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ"],
            [["CH-H08"]],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Mã căn/hộ",
        });
        expect(json.data.rowErrors).toHaveLength(1);
        expect(json.data.rowErrors[0].message).toContain("cụm dân cư");
    });

    it("co ten chu so huu nhung SDT khong hop le -> khong bao loi ca dong, khong tao tai khoan luc commit", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ", "Phân khu/dãy", "Chủ sở hữu", "SĐT"],
            [["CH-I09", "Dãy I", "Trần Thị C", "0123"]],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            ownerName: "Chủ sở hữu",
            ownerPhone: "SĐT",
        });
        expect(json.data.rowErrors).toHaveLength(0);
        expect(json.data.previewData[0].ownerName).toBeUndefined();

        const { json: commitJson } = await commit(
            adminHeaders,
            uploadJson.data._id,
        );
        expect(commitJson.data.committedCount).toBe(1);
        const owners = await User.find({ displayName: "Trần Thị C" });
        expect(owners).toHaveLength(0);
    });

    it("cac cot phu (khong mapping) duoc gop vao Ghi chu luc commit", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ", "Phân khu/dãy", "Số nhân khẩu", "Ghi chú tự do"],
            [["CH-J10", "Dãy J", 4, "Hộ đông người"]],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            memberCount: "Số nhân khẩu",
            note: "Ghi chú tự do",
        });
        expect(json.data.previewData[0].note).toContain("Số nhân khẩu: 4");
        expect(json.data.previewData[0].note).toContain(
            "Ghi chú: Hộ đông người",
        );

        await commit(adminHeaders, uploadJson.data._id);
        const house = await HouseRecord.findOne({ code: "CH-J10" });
        expect(house!.note).toContain("Hộ đông người");
    });

    it("hai dong cung SDT chu so huu -> chi tao 1 tai khoan, tai su dung cho dong sau", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ", "Phân khu/dãy", "Chủ sở hữu", "SĐT"],
            [
                ["CH-K11", "Dãy K", "Lê Văn D", "0987654321"],
                ["CH-K12", "Dãy K", "Lê Văn D", "0987654321"],
            ],
        );

        await applyMapping(adminHeaders, uploadJson.data._id, {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
            ownerName: "Chủ sở hữu",
            ownerPhone: "SĐT",
        });

        const { json } = await commit(adminHeaders, uploadJson.data._id);
        expect(json.data.committedCount).toBe(2);

        const owners = await User.find({ phone: "0987654321" });
        expect(owners).toHaveLength(1);
    });

    it("khong the commit khi chua chon cot (awaiting_mapping)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Mã căn/hộ"],
            [["CH-L13"]],
        );

        const { res } = await commit(adminHeaders, uploadJson.data._id);
        expect(res.status).toBe(400);
    });

    it("khong the commit khi con loi, va khong the commit lai lan hai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const badUpload = await upload(
            adminHeaders,
            ["Mã căn/hộ", "Phân khu/dãy"],
            [["", "Dãy M"]],
        );
        await applyMapping(adminHeaders, badUpload.data._id, {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
        });
        const blockedCommit = await commit(adminHeaders, badUpload.data._id);
        expect(blockedCommit.res.status).toBe(400);

        const goodUpload = await upload(
            adminHeaders,
            ["Mã căn/hộ", "Phân khu/dãy"],
            [["CH-M14", "Dãy M"]],
        );
        await applyMapping(adminHeaders, goodUpload.data._id, {
            code: "Mã căn/hộ",
            subZone: "Phân khu/dãy",
        });

        const firstCommit = await commit(adminHeaders, goodUpload.data._id);
        expect(firstCommit.res.status).toBe(200);
        expect(firstCommit.json.data.committedCount).toBe(1);

        const secondCommit = await commit(adminHeaders, goodUpload.data._id);
        expect(secondCommit.res.status).toBe(400);

        const created = await HouseRecord.find({ code: "CH-M14" });
        expect(created).toHaveLength(1);
    });

    it("nguoi khong co quyen imports.manage bi tu choi (403)", async () => {
        const staff = await createTestUser({ roles: ["secretary"] });
        const staffHeaders = await authHeaders(staff);
        const file = await buildWorkbookFile(
            ["Mã căn/hộ"],
            [["CH-N15"]],
        );
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
