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

/**
 * Luong xin duyet/duyet/tu choi binh thuong khong con di qua route nay - xem
 * tests/api/businessDocumentVerification.test.ts. Route nay gio chi la mot
 * cong cu ghi de thu cong danh cho admin (vd reset lai ho so).
 */
describe("Ghi de thu cong trang thai ho kinh doanh (admin-only override)", () => {
    it("moi tao mac dinh la unverified", async () => {
        const { business } = await setupOwnerWithBusiness("Cụm A");
        expect(business.status).toBe("unverified");
    });

    it("chu ho khong duoc tu doi trang thai (khong phai admin)", async () => {
        const { business, headers } = await setupOwnerWithBusiness("Cụm A");
        const res = await patchStatus(business._id, "pending_approval", headers);
        expect(res.status).toBe(403);
    });

    it("nhan vien co businesses.verify cung khong duoc dung route nay (chi admin)", async () => {
        const { business } = await setupOwnerWithBusiness("Cụm A");
        const leader = await createTestUser({
            roles: ["neighborhood_leader"],
            permissions: ["businesses.verify"],
        });
        const leaderHeaders = await authHeaders(leader);
        const res = await patchStatus(business._id, "verified", leaderHeaders);
        expect(res.status).toBe(403);
    });

    it("admin ghi de duoc sang bat ky trang thai nao", async () => {
        const { business } = await setupOwnerWithBusiness("Cụm A");
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const res = await patchStatus(business._id, "verified", adminHeaders);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("verified");
    });
});
