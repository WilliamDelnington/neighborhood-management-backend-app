import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { POST as createBusinessRoute } from "@/app/api/businesses/route";
import { PATCH as updateBusinessStatusRoute } from "@/app/api/businesses/[id]/status/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function setupOwnerWithBusiness(clusterName: string) {
    const owner = await createTestUser({
        roles: ["house_owner"],
        permissions: ["businesses.read", "businesses.create", "businesses.update"],
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

async function patchStatus(businessId: string, status: string, headers: any) {
    return updateBusinessStatusRoute(
        makeRequest(`/api/businesses/${businessId}/status`, {
            method: "PATCH",
            headers,
            body: { status },
        }),
        { params: { id: businessId } },
    );
}

describe("Chuyen trang thai xac thuc ho kinh doanh (business verification)", () => {
    it("moi tao mac dinh la unverified", async () => {
        const { business } = await setupOwnerWithBusiness("Cụm A");
        expect(business.status).toBe("unverified");
    });

    it("chu ho gui duyet duoc (unverified -> pending)", async () => {
        const { business, headers } = await setupOwnerWithBusiness("Cụm A");
        const res = await patchStatus(business._id, "pending", headers);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("pending");
    });

    it("chu ho khong duoc tu duyet thang len verified", async () => {
        const { business, headers } = await setupOwnerWithBusiness("Cụm A");
        const res = await patchStatus(business._id, "verified", headers);
        expect(res.status).toBe(403);
    });

    it("houseOwner khac khong duoc gui duyet ho kinh doanh khong phai cua minh", async () => {
        const a = await setupOwnerWithBusiness("Cụm A");
        const b = await setupOwnerWithBusiness("Cụm B");
        const res = await patchStatus(a.business._id, "pending", b.headers);
        expect(res.status).toBe(403);
    });

    it("nhan vien co quyen businesses.verify duyet duoc khi dang pending va trong pham vi cum", async () => {
        const { business, headers } = await setupOwnerWithBusiness("Cụm A");
        await patchStatus(business._id, "pending", headers);

        const leader = await createTestUser({
            roles: ["neighborhood_leader"],
            permissions: ["businesses.verify"],
            assignedClusters: ["Cụm A"],
        });
        const leaderHeaders = await authHeaders(leader);

        const res = await patchStatus(business._id, "verified", leaderHeaders);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("verified");
    });

    it("nhan vien ngoai pham vi cum khong duyet duoc", async () => {
        const { business, headers } = await setupOwnerWithBusiness("Cụm A");
        await patchStatus(business._id, "pending", headers);

        const leader = await createTestUser({
            roles: ["neighborhood_leader"],
            permissions: ["businesses.verify"],
            assignedClusters: ["Cụm B"],
        });
        const leaderHeaders = await authHeaders(leader);

        const res = await patchStatus(business._id, "verified", leaderHeaders);
        expect(res.status).toBe(403);
    });
});
