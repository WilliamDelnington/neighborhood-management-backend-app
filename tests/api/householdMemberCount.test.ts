import { describe, it, expect } from "vitest";
import {
    POST as createHouseholdRoute,
} from "@/app/api/households/route";
import {
    GET as listHouseholdCitizensRoute,
} from "@/app/api/households/[id]/citizens/route";
import {
    POST as createCitizenRoute,
} from "@/app/api/citizens/route";
import {
    PATCH as updateCitizenRoute,
    DELETE as deleteCitizenRoute,
} from "@/app/api/citizens/[id]/route";
import { Household } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createHousehold(
    headers: Record<string, string>,
    headOfHousehold = "Nguyễn Văn Test",
) {
    return readJson(
        await createHouseholdRoute(
            makeRequest("/api/households", {
                method: "POST",
                headers,
                body: {
                    cluster: "Cụm Test",
                    address: "Số 1, Cụm Test",
                    headOfHousehold,
                    phone: "0912345678",
                    // Gui kem memberCount thu xem co bi bo qua khong.
                    memberCount: 999,
                },
            }),
        ),
    );
}

async function createCitizen(
    headers: Record<string, string>,
    householdId: string,
    fullName: string,
) {
    return readJson(
        await createCitizenRoute(
            makeRequest("/api/citizens", {
                method: "POST",
                headers,
                body: { fullName, householdId },
            }),
        ),
    );
}

describe("Household.memberCount tu dong +1/-1 khi Citizen duoc them/xoa/chuyen ho dan", () => {
    it("tao ho dan tu dong tao Citizen 'Chủ hộ' va memberCount bat dau tu 1, bo qua gia tri client gui len", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await createHousehold(headers, "Nguyễn Văn Test");
        expect(created.data.memberCount).toBe(1);

        const citizens = await readJson(
            await listHouseholdCitizensRoute(
                makeRequest(
                    `/api/households/${created.data._id}/citizens`,
                    { method: "GET", headers },
                ),
                { params: { id: created.data._id } },
            ),
        );
        expect(citizens.data.items).toHaveLength(1);
        expect(citizens.data.items[0].fullName).toBe("Nguyễn Văn Test");
        expect(citizens.data.items[0].relationToHead).toBe("Chủ hộ");
        // contactIsHead mac dinh true (khong truyen len) - Citizen "Chủ hộ"
        // duoc gan luon phone cua nguoi lien he.
        expect(citizens.data.items[0].phone).toBe("*******678");
    });

    it("contactIsHead=false: tao them Citizen 'Người liên hệ' rieng mang phone, chu ho khong co phone", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const created = await readJson(
            await createHouseholdRoute(
                makeRequest("/api/households", {
                    method: "POST",
                    headers,
                    body: {
                        cluster: "Cụm Test",
                        address: "Số 1, Cụm Test",
                        headOfHousehold: "Nguyễn Văn Test",
                        phone: "0912345678",
                        contactIsHead: false,
                        contactName: "Trần Thị Liên Hệ",
                    },
                }),
            ),
        );
        expect(created.data.memberCount).toBe(2);

        const citizens = await readJson(
            await listHouseholdCitizensRoute(
                makeRequest(
                    `/api/households/${created.data._id}/citizens`,
                    { method: "GET", headers },
                ),
                { params: { id: created.data._id } },
            ),
        );
        expect(citizens.data.items).toHaveLength(2);
        const head = citizens.data.items.find(
            (c: any) => c.relationToHead === "Chủ hộ",
        );
        const contact = citizens.data.items.find(
            (c: any) => c.relationToHead === "Người liên hệ",
        );
        expect(head.fullName).toBe("Nguyễn Văn Test");
        expect(head.phone).toBeUndefined();
        expect(contact.fullName).toBe("Trần Thị Liên Hệ");
        expect(contact.phone).toBe("*******678");
    });

    it("them nhan khau +1, xoa nhan khau -1 (chua tinh Citizen 'Chủ hộ' co san)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const household = await createHousehold(headers);
        const householdId = household.data._id;
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(1);

        const citizenA = await createCitizen(headers, householdId, "Nguyễn Văn A");
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(2);

        const citizenB = await createCitizen(headers, householdId, "Nguyễn Văn B");
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(3);

        await deleteCitizenRoute(
            makeRequest(`/api/citizens/${citizenA.data._id}`, {
                method: "DELETE",
                headers,
            }),
            { params: { id: citizenA.data._id } },
        );
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(2);

        await deleteCitizenRoute(
            makeRequest(`/api/citizens/${citizenB.data._id}`, {
                method: "DELETE",
                headers,
            }),
            { params: { id: citizenB.data._id } },
        );
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(1);
    });

    it("chuyen nhan khau sang ho dan khac: -1 o ho cu, +1 o ho moi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const householdA = await createHousehold(headers);
        const householdB = await createHousehold(headers);

        const citizen = await createCitizen(
            headers,
            householdA.data._id,
            "Trần Thị C",
        );
        expect(
            (await Household.findById(householdA.data._id))!.memberCount,
        ).toBe(2);
        expect(
            (await Household.findById(householdB.data._id))!.memberCount,
        ).toBe(1);

        await updateCitizenRoute(
            makeRequest(`/api/citizens/${citizen.data._id}`, {
                method: "PATCH",
                headers,
                body: { householdId: householdB.data._id },
            }),
            { params: { id: citizen.data._id } },
        );

        expect(
            (await Household.findById(householdA.data._id))!.memberCount,
        ).toBe(1);
        expect(
            (await Household.findById(householdB.data._id))!.memberCount,
        ).toBe(2);
    });
});
