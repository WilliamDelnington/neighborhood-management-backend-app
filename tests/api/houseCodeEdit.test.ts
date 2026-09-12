import { describe, it, expect } from "vitest";
import { POST as createHouseRoute } from "@/app/api/houses/route";
import { PATCH as updateHouseRoute } from "@/app/api/houses/[id]/route";
import { PATCH as transitionStatusRoute } from "@/app/api/houses/[id]/status/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

/**
 * "Mã căn/hộ" (House.code) truoc day KHONG the sua duoc qua bat ky luong nao
 * (khong co trong validators/houseRecord.ts, khong co trong
 * HOUSE_RECORD_PROTECTED_FIELDS/ChangeRequest) - chi duoc dat mot lan luc tao
 * (tu sinh hoac tu Excel import). Cac test nay kiem tra kha nang sua lai ma
 * sau khi tao (vd sua ma nhap sai/khong dung quy uoc tu Excel), voi cung co
 * che bao ve nhu address/cluster (khoa boi trang thai "verified" cho nguoi
 * khong phai admin, admin van sua truc tiep duoc).
 */
describe("Sua 'Mã căn/hộ' (House.code) sau khi tao", () => {
    it("nha con 'unverified': sua code truc tiep qua PATCH thanh cong", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);

        const createRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: ownerHeaders,
                body: { cluster: "Cụm A", address: "Số 1" },
            }),
        );
        const created = (await readJson(createRes)).data;

        const updateRes = await updateHouseRoute(
            makeRequest(`/api/houses/${created._id}`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { code: "H01-L19" },
            }),
            { params: { id: created._id } },
        );
        expect(updateRes.status).toBe(200);
        const updated = (await readJson(updateRes)).data;
        expect(updated.code).toBe("H01-L19");
    });

    it("sua code trung voi nha khac dang co -> tu choi (409)", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);

        await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: ownerHeaders,
                body: { cluster: "Cụm B", address: "Số 2" },
            }),
        );
        const secondCreate = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: ownerHeaders,
                body: { cluster: "Cụm B", address: "Số 3" },
            }),
        );
        const second = (await readJson(secondCreate)).data;
        const firstCode = (
            await readJson(
                await createHouseRoute(
                    makeRequest("/api/houses", {
                        method: "POST",
                        headers: ownerHeaders,
                        body: { cluster: "Cụm B", address: "Số 4" },
                    }),
                ),
            )
        ).data.code;

        const updateRes = await updateHouseRoute(
            makeRequest(`/api/houses/${second._id}`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { code: firstCode },
            }),
            { params: { id: second._id } },
        );
        expect(updateRes.status).toBe(409);
    });

    it("nha da 'verified': nguoi khong phai admin bi tu choi sua code truc tiep (phai qua ChangeRequest)", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const createRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: ownerHeaders,
                body: { cluster: "Cụm C", address: "Số 5" },
            }),
        );
        const created = (await readJson(createRes)).data;

        await transitionStatusRoute(
            makeRequest(`/api/houses/${created._id}/status`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { status: "pending" },
            }),
            { params: { id: created._id } },
        );
        await transitionStatusRoute(
            makeRequest(`/api/houses/${created._id}/status`, {
                method: "PATCH",
                headers: adminHeaders,
                body: { status: "verified", note: "Đã kiểm tra thực địa" },
            }),
            { params: { id: created._id } },
        );

        const updateRes = await updateHouseRoute(
            makeRequest(`/api/houses/${created._id}`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { code: "MA-MOI" },
            }),
            { params: { id: created._id } },
        );
        expect(updateRes.status).toBe(403);

        // Admin van sua truc tiep duoc (giong address/cluster) - chi
        // neighborhoodId la bi khoa tuyet doi ke ca voi admin.
        const adminUpdateRes = await updateHouseRoute(
            makeRequest(`/api/houses/${created._id}`, {
                method: "PATCH",
                headers: adminHeaders,
                body: { code: "MA-MOI" },
            }),
            { params: { id: created._id } },
        );
        expect(adminUpdateRes.status).toBe(200);
        const adminUpdated = (await readJson(adminUpdateRes)).data;
        expect(adminUpdated.code).toBe("MA-MOI");
    });
});
