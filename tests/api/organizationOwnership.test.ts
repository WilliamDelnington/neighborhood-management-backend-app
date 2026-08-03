import { describe, it, expect } from "vitest";
import {
    POST as createOrganizationRoute,
    GET as listOrganizationsRoute,
} from "@/app/api/organizations/route";
import { GET as getOrganizationRoute } from "@/app/api/organizations/[id]/route";
import {
    POST as createHouseRoute,
    GET as listHousesRoute,
} from "@/app/api/houses/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createOrganizationFor(
    headers: Record<string, string>,
    taxCode: string,
) {
    const res = await createOrganizationRoute(
        makeRequest("/api/organizations", {
            method: "POST",
            headers,
            body: {
                name: `To chuc ${taxCode}`,
                taxCode,
                organizationType: "cong_ty",
            },
        }),
    );
    return { res, json: await readJson(res) };
}

describe("Chu nha la to chuc (organization ownership)", () => {
    it("nguoi dai dien tao duoc to chuc, va nha dang ky duoi ten to chuc do xuat hien trong danh sach nha cua ho", async () => {
        const representative = await createTestUser({ roles: ["house_owner"] });
        const headers = await authHeaders(representative);

        const { res: orgRes, json: orgJson } = await createOrganizationFor(
            headers,
            "TAX-001",
        );
        expect(orgRes.status).toBe(201);
        const organization = orgJson.data;

        const houseRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers,
                body: {
                    cluster: "Cụm A",
                    address: "Số 1, Cụm A",
                    organizationId: organization._id,
                },
            }),
        );
        const houseJson = await readJson(houseRes);
        expect(houseRes.status).toBe(201);
        expect(houseJson.data.ownerType).toBe("organization");
        expect(houseJson.data.ownerId).toBe(organization._id);

        const listRes = await listHousesRoute(
            makeRequest("/api/houses", { headers }),
        );
        const listJson = await readJson(listRes);
        expect(listJson.data.items.map((h: any) => h._id)).toContain(
            houseJson.data._id,
        );
    });

    it("house_owner khac khong the dang ky nha duoi ten to chuc ma minh khong phai nguoi dai dien", async () => {
        const representative = await createTestUser({ roles: ["house_owner"] });
        const repHeaders = await authHeaders(representative);
        const { json: orgJson } = await createOrganizationFor(
            repHeaders,
            "TAX-002",
        );

        const stranger = await createTestUser({ roles: ["house_owner"] });
        const strangerHeaders = await authHeaders(stranger);

        const houseRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: strangerHeaders,
                body: {
                    cluster: "Cụm B",
                    address: "Số 2, Cụm B",
                    organizationId: orgJson.data._id,
                },
            }),
        );
        expect(houseRes.status).toBe(403);
    });

    it("house_owner chi thay to chuc ma minh la nguoi dai dien, khong thay to chuc cua nguoi khac", async () => {
        const representative = await createTestUser({ roles: ["house_owner"] });
        const repHeaders = await authHeaders(representative);
        const { json: orgJson } = await createOrganizationFor(
            repHeaders,
            "TAX-003",
        );

        const stranger = await createTestUser({ roles: ["house_owner"] });
        const strangerHeaders = await authHeaders(stranger);

        const listRes = await listOrganizationsRoute(
            makeRequest("/api/organizations", { headers: strangerHeaders }),
        );
        const listJson = await readJson(listRes);
        expect(
            listJson.data.items.map((o: any) => o._id),
        ).not.toContain(orgJson.data._id);

        const getRes = await getOrganizationRoute(
            makeRequest(`/api/organizations/${orgJson.data._id}`, {
                headers: strangerHeaders,
            }),
            { params: { id: orgJson.data._id } },
        );
        expect(getRes.status).toBe(403);
    });
});
