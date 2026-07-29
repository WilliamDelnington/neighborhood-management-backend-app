import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import {
    POST as createBusinessRoute,
    GET as listBusinessesRoute,
} from "@/app/api/businesses/route";
import { DELETE as deleteBusinessRoute } from "@/app/api/businesses/[id]/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

const BUSINESS_PERMISSIONS = [
    "businesses.read",
    "businesses.create",
    "businesses.delete",
];

async function setupOwnerWithBusiness(clusterName: string) {
    const owner = await createTestUser({
        roles: ["house_owner"],
        permissions: BUSINESS_PERMISSIONS,
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

    const businessRes = await createBusinessRoute(
        makeRequest("/api/businesses", {
            method: "POST",
            headers,
            body: { name: `Tiệm tại ${clusterName}`, houseId: house._id },
        }),
    );
    const business = (await readJson(businessRes)).data;

    return { owner, headers, house, business };
}

describe("Quyen so huu ho kinh doanh cua houseOwner (business ownership scoping)", () => {
    it("houseOwner chi thay ho kinh doanh cua chinh minh, khong thay ho kinh doanh cua houseOwner khac", async () => {
        const a = await setupOwnerWithBusiness("Cụm A");
        await setupOwnerWithBusiness("Cụm B");

        const res = await listBusinessesRoute(
            makeRequest("/api/businesses", { headers: a.headers }),
        );
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.items.map((b: any) => b._id)).toEqual([
            a.business._id,
        ]);
    });

    it("admin thay duoc ho kinh doanh cua ca hai houseOwner", async () => {
        const a = await setupOwnerWithBusiness("Cụm A");
        const b = await setupOwnerWithBusiness("Cụm B");
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const res = await listBusinessesRoute(
            makeRequest("/api/businesses", { headers: adminHeaders }),
        );
        const json = await readJson(res);
        const ids = json.data.items.map((item: any) => item._id);

        expect(res.status).toBe(200);
        expect(ids).toContain(a.business._id);
        expect(ids).toContain(b.business._id);
    });

    it("houseOwner khac khong the xoa ho kinh doanh khong phai cua minh", async () => {
        const a = await setupOwnerWithBusiness("Cụm A");
        const b = await setupOwnerWithBusiness("Cụm B");

        const res = await deleteBusinessRoute(
            makeRequest(`/api/businesses/${a.business._id}`, {
                method: "DELETE",
                headers: b.headers,
            }),
            { params: { id: a.business._id } },
        );
        expect(res.status).toBe(403);
    });
});
