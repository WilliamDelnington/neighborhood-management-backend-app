import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { POST as createHouseholdRoute } from "@/app/api/households/route";
import { PATCH as updateHouseholdRoute } from "@/app/api/households/[id]/route";
import { POST as createHouseholdHeadAccountRoute } from "@/app/api/households/[id]/head-account/route";
import { POST as createBusinessRoute } from "@/app/api/businesses/route";
import { PATCH as updateBusinessRoute } from "@/app/api/businesses/[id]/route";
import { POST as createBusinessRepresentativeAccountRoute } from "@/app/api/businesses/[id]/representative-account/route";
import { POST as createCompanyRoute } from "@/app/api/companies/route";
import { POST as createCompanyRepresentativeAccountRoute } from "@/app/api/companies/[id]/representative-account/route";
import { Household } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createOwnedHouse(ownerHeaders: Record<string, string>, address: string) {
    const res = await createHouseRoute(
        makeRequest("/api/houses", {
            method: "POST",
            headers: ownerHeaders,
            body: { cluster: "Cụm kiểm thử", address },
        }),
    );
    return (await readJson(res)).data;
}

describe("Chu ho (household_head) role-gating", () => {
    it("gan headOfHouseholdUserId cho tai khoan household_head thanh cong (khong con chi cho house_owner)", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Số 10, Cụm kiểm thử");
        const householdRes = await createHouseholdRoute(
            makeRequest("/api/households", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    cluster: "Cụm kiểm thử",
                    address: "Số 10, Cụm kiểm thử",
                    headOfHousehold: "Tạm",
                    phone: "0911111101",
                    houseId: house._id,
                },
            }),
        );
        const household = (await readJson(householdRes)).data;

        const head = await createTestUser({ roles: ["household_head"] });
        const updateRes = await updateHouseholdRoute(
            makeRequest(`/api/households/${household._id}`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { headOfHouseholdUserId: String(head._id) },
            }),
            { params: { id: household._id } },
        );
        expect(updateRes.status).toBe(200);
        const updated = (await readJson(updateRes)).data;
        expect(String(updated.headOfHouseholdUserId._id)).toBe(String(head._id));
    });

    it("tu choi gan tai khoan khong co vai tro household_head/house_owner", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Số 11, Cụm kiểm thử");
        const householdRes = await createHouseholdRoute(
            makeRequest("/api/households", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    cluster: "Cụm kiểm thử",
                    address: "Số 11, Cụm kiểm thử",
                    headOfHousehold: "Tạm",
                    phone: "0911111102",
                    houseId: house._id,
                },
            }),
        );
        const household = (await readJson(householdRes)).data;

        const unrelated = await createTestUser({ roles: ["neighborhood_leader"] });
        const updateRes = await updateHouseholdRoute(
            makeRequest(`/api/households/${household._id}`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { headOfHouseholdUserId: String(unrelated._id) },
            }),
            { params: { id: household._id } },
        );
        expect(updateRes.status).toBe(422);
    });
});

describe("createHouseholdHeadByOwner (chu nha tu tao tai khoan chu ho)", () => {
    it("chu nha tao va lien ket tai khoan chu ho cho ho dan cua chinh minh", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Số 12, Cụm kiểm thử");
        const householdRes = await createHouseholdRoute(
            makeRequest("/api/households", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    cluster: "Cụm kiểm thử",
                    address: "Số 12, Cụm kiểm thử",
                    headOfHousehold: "Tạm",
                    phone: "0911111103",
                    houseId: house._id,
                },
            }),
        );
        const household = (await readJson(householdRes)).data;

        const createRes = await createHouseholdHeadAccountRoute(
            makeRequest(`/api/households/${household._id}/head-account`, {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    phone: "0922222201",
                    displayName: "Chủ hộ mới",
                    idNumber: "001200012345",
                },
            }),
            { params: { id: household._id } },
        );
        expect(createRes.status).toBe(201);
        const created = (await readJson(createRes)).data;
        expect(created.roles).toContain("household_head");

        const refreshed = await Household.findById(household._id);
        expect(String(refreshed?.headOfHouseholdUserId)).toBe(String(created.id));
    });

    it("tu choi neu ho dan da co tai khoan chu ho (409)", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Số 13, Cụm kiểm thử");
        const householdRes = await createHouseholdRoute(
            makeRequest("/api/households", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    cluster: "Cụm kiểm thử",
                    address: "Số 13, Cụm kiểm thử",
                    headOfHousehold: "Tạm",
                    phone: "0911111104",
                    houseId: house._id,
                },
            }),
        );
        const household = (await readJson(householdRes)).data;

        await createHouseholdHeadAccountRoute(
            makeRequest(`/api/households/${household._id}/head-account`, {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    phone: "0922222202",
                    displayName: "Chủ hộ A",
                    idNumber: "001200012346",
                },
            }),
            { params: { id: household._id } },
        );

        const secondRes = await createHouseholdHeadAccountRoute(
            makeRequest(`/api/households/${household._id}/head-account`, {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    phone: "0922222203",
                    displayName: "Chủ hộ B",
                    idNumber: "001200012347",
                },
            }),
            { params: { id: household._id } },
        );
        expect(secondRes.status).toBe(409);
    });

    it("tu choi neu actor khong so huu nha cua ho dan (403)", async () => {
        const ownerA = await createTestUser({ roles: ["house_owner"] });
        const ownerAHeaders = await authHeaders(ownerA);
        const house = await createOwnedHouse(ownerAHeaders, "Số 14, Cụm kiểm thử");
        const householdRes = await createHouseholdRoute(
            makeRequest("/api/households", {
                method: "POST",
                headers: ownerAHeaders,
                body: {
                    cluster: "Cụm kiểm thử",
                    address: "Số 14, Cụm kiểm thử",
                    headOfHousehold: "Tạm",
                    phone: "0911111105",
                    houseId: house._id,
                },
            }),
        );
        const household = (await readJson(householdRes)).data;

        const ownerB = await createTestUser({ roles: ["house_owner"] });
        const ownerBHeaders = await authHeaders(ownerB);
        const res = await createHouseholdHeadAccountRoute(
            makeRequest(`/api/households/${household._id}/head-account`, {
                method: "POST",
                headers: ownerBHeaders,
                body: {
                    phone: "0922222204",
                    displayName: "Chủ hộ lạ",
                    idNumber: "001200012348",
                },
            }),
            { params: { id: household._id } },
        );
        expect(res.status).toBe(403);
    });
});

describe("Nguoi dai dien ho kinh doanh/cong ty - role-gating + tu tao tai khoan", () => {
    it("tu choi gan representativeUserId cho tai khoan khong co vai tro phu hop", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Số 15, Cụm kiểm thử");
        const businessRes = await createBusinessRoute(
            makeRequest("/api/businesses", {
                method: "POST",
                headers: ownerHeaders,
                body: { name: "Tiệm kiểm thử", houseId: house._id },
            }),
        );
        const business = (await readJson(businessRes)).data;

        const unrelated = await createTestUser({ roles: ["neighborhood_leader"] });
        const updateRes = await updateBusinessRoute(
            makeRequest(`/api/businesses/${business._id}`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { representativeUserId: String(unrelated._id) },
            }),
            { params: { id: business._id } },
        );
        expect(updateRes.status).toBe(422);
    });

    it("chu nha tao va lien ket tai khoan dai dien cho ho kinh doanh cua chinh minh", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Số 16, Cụm kiểm thử");
        const businessRes = await createBusinessRoute(
            makeRequest("/api/businesses", {
                method: "POST",
                headers: ownerHeaders,
                body: { name: "Tiệm kiểm thử 2", houseId: house._id },
            }),
        );
        const business = (await readJson(businessRes)).data;

        const createRes = await createBusinessRepresentativeAccountRoute(
            makeRequest(`/api/businesses/${business._id}/representative-account`, {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    phone: "0922222205",
                    displayName: "Đại diện hộ kinh doanh",
                    idNumber: "001200012349",
                },
            }),
            { params: { id: business._id } },
        );
        expect(createRes.status).toBe(201);
        expect((await readJson(createRes)).data.roles).toContain(
            "business_representative",
        );
    });

    it("chu nha tao va lien ket tai khoan dai dien cho cong ty cua chinh minh", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const house = await createOwnedHouse(ownerHeaders, "Số 17, Cụm kiểm thử");
        const companyRes = await createCompanyRoute(
            makeRequest("/api/companies", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    name: "Công ty kiểm thử",
                    houseId: house._id,
                    taxCode: "0123456789",
                },
            }),
        );
        const company = (await readJson(companyRes)).data;

        const createRes = await createCompanyRepresentativeAccountRoute(
            makeRequest(`/api/companies/${company._id}/representative-account`, {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    phone: "0922222206",
                    displayName: "Đại diện công ty",
                    idNumber: "001200012350",
                },
            }),
            { params: { id: company._id } },
        );
        expect(createRes.status).toBe(201);
        expect((await readJson(createRes)).data.roles).toContain(
            "company_representative",
        );
    });

    it("tu choi neu actor khong so huu nha cua ho kinh doanh (403)", async () => {
        const ownerA = await createTestUser({ roles: ["house_owner"] });
        const ownerAHeaders = await authHeaders(ownerA);
        const house = await createOwnedHouse(ownerAHeaders, "Số 18, Cụm kiểm thử");
        const businessRes = await createBusinessRoute(
            makeRequest("/api/businesses", {
                method: "POST",
                headers: ownerAHeaders,
                body: { name: "Tiệm của A", houseId: house._id },
            }),
        );
        const business = (await readJson(businessRes)).data;

        const ownerB = await createTestUser({ roles: ["house_owner"] });
        const ownerBHeaders = await authHeaders(ownerB);
        const res = await createBusinessRepresentativeAccountRoute(
            makeRequest(`/api/businesses/${business._id}/representative-account`, {
                method: "POST",
                headers: ownerBHeaders,
                body: {
                    phone: "0922222207",
                    displayName: "Đại diện lạ",
                    idNumber: "001200012351",
                },
            }),
            { params: { id: business._id } },
        );
        expect(res.status).toBe(403);
    });
});
