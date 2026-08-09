import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import {
    POST as createCompanyRoute,
    GET as listCompaniesRoute,
} from "@/app/api/companies/route";
import { DELETE as deleteCompanyRoute } from "@/app/api/companies/[id]/route";
import { PATCH as updateCompanyStatusRoute } from "@/app/api/companies/[id]/status/route";
import { POST as createHouseholdRoute } from "@/app/api/households/route";
import {
    POST as createUsageUnitRoute,
    GET as listUsageUnitsRoute,
} from "@/app/api/houses/[id]/usage-units/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

const OWNER_PERMISSIONS = [
    "houses.create",
    "companies.read",
    "companies.create",
    "households.create",
    "usage_units.read",
    "usage_units.create",
];

async function setupOwnerWithHouse(clusterName: string) {
    const owner = await createTestUser({
        roles: ["house_owner"],
        permissions: OWNER_PERMISSIONS,
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

async function createCompanyFor(
    headers: Record<string, string>,
    houseId: string,
    name: string,
) {
    const res = await createCompanyRoute(
        makeRequest("/api/companies", {
            method: "POST",
            headers,
            body: { name, houseId },
        }),
    );
    return (await readJson(res)).data;
}

async function createHouseholdFor(
    headers: Record<string, string>,
    houseId: string,
    cluster: string,
) {
    const res = await createHouseholdRoute(
        makeRequest("/api/households", {
            method: "POST",
            headers,
            body: {
                cluster,
                address: `Số 1, ${cluster}`,
                headOfHousehold: "Nguyễn Văn A",
                houseId,
            },
        }),
    );
    return (await readJson(res)).data;
}

describe("Cong ty (Company)", () => {
    it("houseOwner chi thay cong ty cua chinh minh, admin thay tat ca", async () => {
        const a = await setupOwnerWithHouse("Cụm A");
        const b = await setupOwnerWithHouse("Cụm B");
        const companyA = await createCompanyFor(a.headers, a.house._id, "Công ty A");
        const companyB = await createCompanyFor(b.headers, b.house._id, "Công ty B");

        const resA = await listCompaniesRoute(
            makeRequest("/api/companies", { headers: a.headers }),
        );
        const jsonA = await readJson(resA);
        expect(jsonA.data.items.map((c: any) => c._id)).toEqual([companyA._id]);

        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const resAdmin = await listCompaniesRoute(
            makeRequest("/api/companies", { headers: adminHeaders }),
        );
        const jsonAdmin = await readJson(resAdmin);
        const ids = jsonAdmin.data.items.map((c: any) => c._id);
        expect(ids).toContain(companyA._id);
        expect(ids).toContain(companyB._id);
    });

    it("khong the xoa cong ty da xac thuc", async () => {
        const a = await setupOwnerWithHouse("Cụm C");
        const company = await createCompanyFor(a.headers, a.house._id, "Công ty C");

        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        await updateCompanyStatusRoute(
            makeRequest(`/api/companies/${company._id}/status`, {
                method: "PATCH",
                headers: adminHeaders,
                body: { status: "verified" },
            }),
            { params: { id: company._id } },
        );

        const deleteRes = await deleteCompanyRoute(
            makeRequest(`/api/companies/${company._id}`, {
                method: "DELETE",
                headers: adminHeaders,
            }),
            { params: { id: company._id } },
        );
        expect(deleteRes.status).toBe(409);
    });
});

describe("Don vi su dung nha (HouseUsageUnit)", () => {
    it("tao don vi su dung gan voi mot ho dan da co san trong nha", async () => {
        const a = await setupOwnerWithHouse("Cụm D");
        const household = await createHouseholdFor(a.headers, a.house._id, "Cụm D");

        const res = await createUsageUnitRoute(
            makeRequest(`/api/houses/${a.house._id}/usage-units`, {
                method: "POST",
                headers: a.headers,
                body: {
                    unitLabel: "Tầng 1",
                    usageType: "household",
                    householdId: household._id,
                },
            }),
            { params: { id: a.house._id } },
        );
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.usageType).toBe("household");

        const listRes = await listUsageUnitsRoute(
            makeRequest(`/api/houses/${a.house._id}/usage-units`, {
                headers: a.headers,
            }),
            { params: { id: a.house._id } },
        );
        const listJson = await readJson(listRes);
        expect(listJson.data).toHaveLength(1);
    });

    it("khong the gan cung mot ho dan vao hai don vi su dung khac nhau", async () => {
        const a = await setupOwnerWithHouse("Cụm E");
        const household = await createHouseholdFor(a.headers, a.house._id, "Cụm E");

        await createUsageUnitRoute(
            makeRequest(`/api/houses/${a.house._id}/usage-units`, {
                method: "POST",
                headers: a.headers,
                body: {
                    unitLabel: "Tầng 1",
                    usageType: "household",
                    householdId: household._id,
                },
            }),
            { params: { id: a.house._id } },
        );

        const secondRes = await createUsageUnitRoute(
            makeRequest(`/api/houses/${a.house._id}/usage-units`, {
                method: "POST",
                headers: a.headers,
                body: {
                    unitLabel: "Tầng 2",
                    usageType: "household",
                    householdId: household._id,
                },
            }),
            { params: { id: a.house._id } },
        );
        expect(secondRes.status).toBe(409);
    });

    it("khong the gan doi tuong khong thuoc ve nha so nay", async () => {
        const a = await setupOwnerWithHouse("Cụm F");
        const b = await setupOwnerWithHouse("Cụm G");
        const householdOfB = await createHouseholdFor(b.headers, b.house._id, "Cụm G");

        const res = await createUsageUnitRoute(
            makeRequest(`/api/houses/${a.house._id}/usage-units`, {
                method: "POST",
                headers: a.headers,
                body: {
                    unitLabel: "Tầng 1",
                    usageType: "household",
                    householdId: householdOfB._id,
                },
            }),
            { params: { id: a.house._id } },
        );
        expect(res.status).toBe(400);
    });

    it("tu choi neu usageType khong khop voi doi tuong tham chieu", async () => {
        const a = await setupOwnerWithHouse("Cụm H");
        const household = await createHouseholdFor(a.headers, a.house._id, "Cụm H");

        const res = await createUsageUnitRoute(
            makeRequest(`/api/houses/${a.house._id}/usage-units`, {
                method: "POST",
                headers: a.headers,
                body: {
                    unitLabel: "Tầng 1",
                    usageType: "business",
                    householdId: household._id,
                },
            }),
            { params: { id: a.house._id } },
        );
        expect(res.status).toBe(422);
    });
});
