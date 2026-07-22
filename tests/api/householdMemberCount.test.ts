import { describe, it, expect } from "vitest";
import {
    POST as createHouseholdRoute,
} from "@/app/api/households/route";
import {
    POST as createCitizenRoute,
} from "@/app/api/citizens/route";
import {
    PATCH as updateCitizenRoute,
    DELETE as deleteCitizenRoute,
} from "@/app/api/citizens/[id]/route";
import { Household } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createHousehold(headers: Record<string, string>) {
    return readJson(
        await createHouseholdRoute(
            makeRequest("/api/households", {
                method: "POST",
                headers,
                body: {
                    cluster: "Cụm Test",
                    address: "Số 1, Cụm Test",
                    headOfHousehold: "Nguyễn Văn Test",
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
    it("memberCount luon bat dau tu 0, bo qua gia tri client gui len khi tao ho dan", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const created = await createHousehold(await authHeaders(admin));
        expect(created.data.memberCount).toBe(0);
    });

    it("them nhan khau +1, xoa nhan khau -1", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const household = await createHousehold(headers);
        const householdId = household.data._id;

        const citizenA = await createCitizen(headers, householdId, "Nguyễn Văn A");
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(1);

        const citizenB = await createCitizen(headers, householdId, "Nguyễn Văn B");
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(2);

        await deleteCitizenRoute(
            makeRequest(`/api/citizens/${citizenA.data._id}`, {
                method: "DELETE",
                headers,
            }),
            { params: { id: citizenA.data._id } },
        );
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(1);

        await deleteCitizenRoute(
            makeRequest(`/api/citizens/${citizenB.data._id}`, {
                method: "DELETE",
                headers,
            }),
            { params: { id: citizenB.data._id } },
        );
        expect(
            (await Household.findById(householdId))!.memberCount,
        ).toBe(0);
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
        ).toBe(1);
        expect(
            (await Household.findById(householdB.data._id))!.memberCount,
        ).toBe(0);

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
        ).toBe(0);
        expect(
            (await Household.findById(householdB.data._id))!.memberCount,
        ).toBe(1);
    });
});
