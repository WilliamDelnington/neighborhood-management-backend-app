import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";
import { POST as uploadRoute } from "@/app/api/import/streets/route";
import { PUT as mappingRoute } from "@/app/api/import/streets/[jobId]/mapping/route";
import { POST as commitRoute } from "@/app/api/import/streets/[jobId]/commit/route";
import { POST as createStreetRoute } from "@/app/api/streets/route";
import { Street } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function buildWorkbookFile(
    headers: string[],
    rows: unknown[][],
): Promise<File> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Streets");
    sheet.addRow(headers);
    rows.forEach(row => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return new File([buffer as unknown as BlobPart], "import-duong-pho.xlsx", {
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
        new Request("http://localhost/api/import/streets", {
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
    mapping: { name: string; code?: string; active?: string },
) {
    const res = await mappingRoute(
        makeRequest(`/api/import/streets/${jobId}/mapping`, {
            method: "PUT",
            headers: adminHeaders,
            body: mapping,
        }),
        { params: { jobId } },
    );
    return { res, json: await readJson(res) };
}

describe("Import Excel: duong/pho (Street)", () => {
    it("upload nhan dien dung header va goi y mapping khi nhan cot khop mac dinh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(
            adminHeaders,
            ["Tên đường/phố", "Mã đường/phố", "Trạng thái"],
            [["Nguyễn Trãi", "NGUYEN_TRAI", "Đang hoạt động"]],
        );
        expect(uploadJson.data.status).toBe("awaiting_mapping");
        expect(uploadJson.data.headers).toEqual([
            "Tên đường/phố",
            "Mã đường/phố",
            "Trạng thái",
        ]);
        expect(uploadJson.data.suggestedMapping).toEqual({
            name: "Tên đường/phố",
            code: "Mã đường/phố",
            active: "Trạng thái",
        });
        expect(uploadJson.data.previewData).toHaveLength(0);
    });

    it("upload voi header tuy y -> khong goi y duoc mapping, phai chon cot thu cong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(
            adminHeaders,
            ["Street Name", "Street Code"],
            [["Lê Lợi", "LE_LOI"]],
        );
        expect(uploadJson.data.status).toBe("awaiting_mapping");
        expect(uploadJson.data.suggestedMapping).toEqual({});

        const { res, json } = await applyMapping(
            adminHeaders,
            uploadJson.data._id,
            { name: "Street Name", code: "Street Code" },
        );
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("validated");
        expect(json.data.previewData[0]).toEqual({
            name: "Lê Lợi",
            code: "LE_LOI",
            active: true,
        });
    });

    it("chon cot -> xem truoc dung: ma tu sinh khi khong chon cot ma, active mac dinh true khi khong chon cot trang thai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const uploadJson = await upload(
            adminHeaders,
            ["Tên đường/phố", "Ghi chú không thuộc mapping"],
            [["Phạm Văn Đồng", "bỏ qua"]],
        );

        const { res, json } = await applyMapping(
            adminHeaders,
            uploadJson.data._id,
            { name: "Tên đường/phố" },
        );
        expect(res.status).toBe(200);
        expect(json.data.rowErrors).toHaveLength(0);
        expect(json.data.previewData[0].name).toBe("Phạm Văn Đồng");
        expect(json.data.previewData[0].code).toBe("PHAM_VAN_DONG");
        expect(json.data.previewData[0].active).toBe(true);
    });

    it("thieu mapping cho 'Tên đường/phố' bi tu choi (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Tên đường/phố"],
            [["Trần Phú"]],
        );

        const { res } = await applyMapping(adminHeaders, uploadJson.data._id, {
            name: "",
        });
        expect(res.status).toBe(422);
    });

    it("chon cot khong ton tai trong file bi tu choi (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Tên đường/phố"],
            [["Trần Phú"]],
        );

        const { res } = await applyMapping(adminHeaders, uploadJson.data._id, {
            name: "Cột không tồn tại",
        });
        expect(res.status).toBe(422);
    });

    it("chon cung mot cot cho hai truong khac nhau bi tu choi (422)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Cột duy nhất"],
            [["Trần Phú"]],
        );

        const { res } = await applyMapping(adminHeaders, uploadJson.data._id, {
            name: "Cột duy nhất",
            code: "Cột duy nhất",
        });
        expect(res.status).toBe(422);
    });

    it("dong thieu ten (sau khi chon cot) bi bao loi va khong duoc dua vao previewData", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Tên đường/phố", "Mã đường/phố"],
            [["", "CODE_X"]],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            name: "Tên đường/phố",
            code: "Mã đường/phố",
        });
        expect(json.data.status).toBe("previewing");
        expect(json.data.rowErrors).toHaveLength(1);
        expect(json.data.rowErrors[0].message).toContain("Tên đường/phố");
        expect(json.data.previewData).toHaveLength(0);
    });

    it("trung ten/ma trong cung file bi bao loi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Tên đường/phố", "Mã đường/phố"],
            [
                ["Trần Phú", "TRAN_PHU"],
                ["Trần Phú", "TRAN_PHU_2"],
                ["Hai Bà Trưng", "TRAN_PHU"],
            ],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            name: "Tên đường/phố",
            code: "Mã đường/phố",
        });
        expect(json.data.totalRows).toBe(3);
        expect(json.data.rowErrors).toHaveLength(2);
        expect(json.data.validRows).toBe(1);
    });

    it("trung ten/ma voi Street da co san trong DB bi bao loi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        await createStreetRoute(
            makeRequest("/api/streets", {
                method: "POST",
                headers: adminHeaders,
                body: { name: "Điện Biên Phủ", code: "DIEN_BIEN_PHU" },
            }),
        );

        const uploadJson = await upload(
            adminHeaders,
            ["Tên đường/phố", "Mã đường/phố"],
            [["Điện Biên Phủ", "DBP_MOI"]],
        );

        const { json } = await applyMapping(adminHeaders, uploadJson.data._id, {
            name: "Tên đường/phố",
            code: "Mã đường/phố",
        });
        expect(json.data.rowErrors).toHaveLength(1);
        expect(json.data.rowErrors[0].message).toContain("đã tồn tại");
    });

    it("khong the commit khi chua chon cot (awaiting_mapping)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const uploadJson = await upload(
            adminHeaders,
            ["Tên đường/phố"],
            [["Trần Phú"]],
        );

        const commitRes = await commitRoute(
            makeRequest(
                `/api/import/streets/${uploadJson.data._id}/commit`,
                { method: "POST", headers: adminHeaders },
            ),
            { params: { jobId: uploadJson.data._id } },
        );
        expect(commitRes.status).toBe(400);
    });

    it("khong the commit khi con loi, va khong the commit lai lan hai", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const badUpload = await upload(
            adminHeaders,
            ["Tên đường/phố"],
            [[""]],
        );
        await applyMapping(adminHeaders, badUpload.data._id, {
            name: "Tên đường/phố",
        });
        const blockedCommit = await commitRoute(
            makeRequest(
                `/api/import/streets/${badUpload.data._id}/commit`,
                { method: "POST", headers: adminHeaders },
            ),
            { params: { jobId: badUpload.data._id } },
        );
        expect(blockedCommit.status).toBe(400);

        const goodUpload = await upload(
            adminHeaders,
            ["Tên đường/phố"],
            [["Phạm Văn Đồng"]],
        );
        await applyMapping(adminHeaders, goodUpload.data._id, {
            name: "Tên đường/phố",
        });

        const firstCommit = await commitRoute(
            makeRequest(
                `/api/import/streets/${goodUpload.data._id}/commit`,
                { method: "POST", headers: adminHeaders },
            ),
            { params: { jobId: goodUpload.data._id } },
        );
        expect(firstCommit.status).toBe(200);
        const firstCommitJson = await readJson(firstCommit);
        expect(firstCommitJson.data.committedCount).toBe(1);

        const secondCommit = await commitRoute(
            makeRequest(
                `/api/import/streets/${goodUpload.data._id}/commit`,
                { method: "POST", headers: adminHeaders },
            ),
            { params: { jobId: goodUpload.data._id } },
        );
        expect(secondCommit.status).toBe(400);

        const created = await Street.find({ code: "PHAM_VAN_DONG" });
        expect(created).toHaveLength(1);
    });

    it("nguoi khong co quyen imports.manage bi tu choi (403)", async () => {
        const staff = await createTestUser({ roles: ["secretary"] });
        const staffHeaders = await authHeaders(staff);
        const file = await buildWorkbookFile(["Tên đường/phố"], [["Test"]]);
        const formData = new FormData();
        formData.append("file", file);
        const res = await uploadRoute(
            new Request("http://localhost/api/import/streets", {
                method: "POST",
                headers: staffHeaders,
                body: formData,
            }),
        );
        expect(res.status).toBe(403);
    });
});
