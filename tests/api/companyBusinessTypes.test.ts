import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import {
    POST as createCompanyRoute,
    GET as listCompaniesRoute,
} from "@/app/api/companies/route";
import { PATCH as updateCompanyRoute } from "@/app/api/companies/[id]/route";
import { POST as createBusinessTypeRoute } from "@/app/api/business-types/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createBusinessType(
    headers: Record<string, string>,
    name: string,
) {
    const res = await createBusinessTypeRoute(
        makeRequest("/api/business-types", {
            method: "POST",
            headers,
            body: { name },
        }),
    );
    return (await readJson(res)).data;
}

async function setupOwnerWithHouse(clusterName: string) {
    const owner = await createTestUser({
        roles: ["house_owner"],
        permissions: [
            "houses.create",
            "companies.read",
            "companies.create",
            "companies.update",
        ],
    });
    const headers = await authHeaders(owner);

    const houseRes = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers,
            body: { cluster: clusterName, address: `Số 1, ${clusterName}` },
        }),
    );
    const house = (await readJson(houseRes)).data;

    return { owner, headers, house };
}

describe("Cong ty (Company) - nhieu loai hinh kinh doanh cung luc", () => {
    it("tao cong ty voi 2 loai hinh kinh doanh, luu ca hai id", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const a = await setupOwnerWithHouse("Cụm BT1");

        const typeRetail = await createBusinessType(adminHeaders, "Bán lẻ");
        const typeFnB = await createBusinessType(adminHeaders, "Ăn uống");

        const res = await createCompanyRoute(
            makeRequest("/api/companies", {
                method: "POST",
                headers: a.headers,
                body: {
                    name: "Công ty Đa ngành",
                    houseId: a.house._id,
                    taxCode: "TAX-MULTI-001",
                    businessTypeIds: [typeRetail._id, typeFnB._id],
                },
            }),
        );
        expect(res.status).toBe(201);
        const json = await readJson(res);
        const ids = json.data.businessTypeIds.map((id: any) => String(id)).sort();
        expect(ids).toEqual([typeFnB._id, typeRetail._id].sort());

        // Danh sach (co populate) phai tra ve day du ten ca hai loai hinh.
        const listRes = await listCompaniesRoute(
            makeRequest("/api/companies", { headers: adminHeaders }),
        );
        const listJson = await readJson(listRes);
        const listed = listJson.data.items.find(
            (c: any) => c._id === json.data._id,
        );
        const names = listed.businessTypeIds.map((bt: any) => bt.name).sort();
        expect(names).toEqual(["Bán lẻ", "Ăn uống"].sort());
    });

    it("tao cong ty voi businessTypeId khong ton tai bi tu choi (404)", async () => {
        const a = await setupOwnerWithHouse("Cụm BT2");

        const res = await createCompanyRoute(
            makeRequest("/api/companies", {
                method: "POST",
                headers: a.headers,
                body: {
                    name: "Công ty X",
                    houseId: a.house._id,
                    taxCode: "TAX-MULTI-002",
                    businessTypeIds: ["64b000000000000000000000"],
                },
            }),
        );
        expect(res.status).toBe(404);
    });

    it("cap nhat cong ty de them/bot loai hinh kinh doanh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const a = await setupOwnerWithHouse("Cụm BT3");
        const typeA = await createBusinessType(adminHeaders, "Loại A");
        const typeB = await createBusinessType(adminHeaders, "Loại B");

        const createRes = await createCompanyRoute(
            makeRequest("/api/companies", {
                method: "POST",
                headers: a.headers,
                body: {
                    name: "Công ty Y",
                    houseId: a.house._id,
                    taxCode: "TAX-MULTI-003",
                    businessTypeIds: [typeA._id],
                },
            }),
        );
        const company = (await readJson(createRes)).data;

        const updateRes = await updateCompanyRoute(
            makeRequest(`/api/companies/${company._id}`, {
                method: "PATCH",
                headers: a.headers,
                body: { businessTypeIds: [typeA._id, typeB._id] },
            }),
            { params: { id: company._id } },
        );
        expect(updateRes.status).toBe(200);
        const updated = (await readJson(updateRes)).data;
        const names = updated.businessTypeIds.map((bt: any) => bt.name).sort();
        expect(names).toEqual(["Loại A", "Loại B"]);
    });

    it("loc danh sach cong ty theo mot loai hinh kinh doanh (khop bat ky)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const a = await setupOwnerWithHouse("Cụm BT4");
        const typeRetail = await createBusinessType(adminHeaders, "Bán lẻ 2");
        const typeFnB = await createBusinessType(adminHeaders, "Ăn uống 2");

        const companyRes1 = await createCompanyRoute(
            makeRequest("/api/companies", {
                method: "POST",
                headers: a.headers,
                body: {
                    name: "Công ty Bán lẻ",
                    houseId: a.house._id,
                    taxCode: "TAX-MULTI-004",
                    businessTypeIds: [typeRetail._id],
                },
            }),
        );
        const companyRetail = (await readJson(companyRes1)).data;

        await createCompanyRoute(
            makeRequest("/api/companies", {
                method: "POST",
                headers: a.headers,
                body: {
                    name: "Công ty Ăn uống",
                    houseId: a.house._id,
                    taxCode: "TAX-MULTI-005",
                    businessTypeIds: [typeFnB._id],
                },
            }),
        );

        const listRes = await listCompaniesRoute(
            makeRequest(
                `/api/companies?businessType=${typeRetail._id}`,
                { headers: adminHeaders },
            ),
        );
        const listJson = await readJson(listRes);
        expect(listJson.data.items.map((c: any) => c._id)).toEqual([
            companyRetail._id,
        ]);
    });
});
