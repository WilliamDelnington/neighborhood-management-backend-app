import { describe, it, expect } from "vitest";
import {
    POST as createHouseRoute,
    GET as listHousesRoute,
} from "@/app/api/houses/route";
import {
    GET as getHouseRoute,
    PATCH as updateHouseRoute,
} from "@/app/api/houses/[id]/route";
import { PATCH as transitionStatusRoute } from "@/app/api/houses/[id]/status/route";
import { GET as auditLogsRoute } from "@/app/api/houses/[id]/audit-logs/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

/**
 * Kiem tra fix "tach trang thai vat ly khoi trang thai ho so/xac thuc cua Nha
 * so" (dac ta muc 5-6) va fix "ghi previousStatus vao audit log khi doi trang
 * thai" (AUDIT-01, 17.10).
 */
describe("Trang thai vat ly (physicalStatus) doc lap voi trang thai ho so (status)", () => {
    it("tao/cap nhat physicalStatus khong lam thay doi trang thai ho so, va nguoc lai", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const createRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    cluster: "Cụm thí điểm",
                    address: "Y01-L12, khu An Phú",
                    physicalStatus: "under_construction",
                },
            }),
        );
        const created = (await readJson(createRes)).data;
        expect(created.physicalStatus).toBe("under_construction");
        expect(created.status).toBe("unverified");

        // Doi physicalStatus qua PATCH thuong - status ho so KHONG doi.
        const updateRes = await updateHouseRoute(
            makeRequest(`/api/houses/${created._id}`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { physicalStatus: "completed" },
            }),
            { params: { id: created._id } },
        );
        const updated = (await readJson(updateRes)).data;
        expect(updated.physicalStatus).toBe("completed");
        expect(updated.status).toBe("unverified");

        // Gui duyet + duyet (doi status ho so) - physicalStatus phai giu nguyen.
        const submitRes = await transitionStatusRoute(
            makeRequest(`/api/houses/${created._id}/status`, {
                method: "PATCH",
                headers: ownerHeaders,
                body: { status: "pending" },
            }),
            { params: { id: created._id } },
        );
        expect(submitRes.status).toBe(200);

        const verifyRes = await transitionStatusRoute(
            makeRequest(`/api/houses/${created._id}/status`, {
                method: "PATCH",
                headers: adminHeaders,
                body: { status: "verified", note: "Đã kiểm tra thực địa" },
            }),
            { params: { id: created._id } },
        );
        const verified = (await readJson(verifyRes)).data;
        expect(verified.status).toBe("verified");
        expect(verified.physicalStatus).toBe("completed");

        const getRes = await getHouseRoute(
            makeRequest(`/api/houses/${created._id}`, { headers: adminHeaders }),
            { params: { id: created._id } },
        );
        const fetched = (await readJson(getRes)).data;
        expect(fetched.physicalStatus).toBe("completed");
        expect(fetched.status).toBe("verified");
    });

    it("nha chua khai physicalStatus tra ve undefined, khong gia dinh gia tri", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);

        const createRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: ownerHeaders,
                body: { cluster: "Cụm không khai", address: "Số 99" },
            }),
        );
        const created = (await readJson(createRes)).data;
        expect(created.physicalStatus).toBeUndefined();
    });

    it("bao ve gia tri khong hop le cho physicalStatus", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);

        const createRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: ownerHeaders,
                body: {
                    cluster: "Cụm lỗi",
                    address: "Số 100",
                    physicalStatus: "khong_ton_tai",
                },
            }),
        );
        expect(createRes.status).toBe(422);
    });

    it("audit log ghi ca previousStatus lan status moi khi doi trang thai nha so (AUDIT-01)", async () => {
        const owner = await createTestUser({ roles: ["house_owner"] });
        const ownerHeaders = await authHeaders(owner);
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);

        const createRes = await createHouseRoute(
            makeRequest("/api/houses", {
                method: "POST",
                headers: ownerHeaders,
                body: { cluster: "Cụm audit", address: "Số 200" },
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
                body: { status: "denied", note: "Thiếu giấy tờ" },
            }),
            { params: { id: created._id } },
        );

        const auditRes = await auditLogsRoute(
            makeRequest(`/api/houses/${created._id}/audit-logs?limit=50`, {
                headers: adminHeaders,
            }),
            { params: { id: created._id } },
        );
        const auditJson = await readJson(auditRes);
        const statusChanges = auditJson.data.items.filter(
            (log: any) => log.action === "house.status_change",
        );
        // Da doi trang thai 2 lan: unverified->pending, pending->denied.
        expect(statusChanges.length).toBe(2);
        const deniedLog = statusChanges.find(
            (log: any) => log.metadata.status === "denied",
        );
        expect(deniedLog.metadata.previousStatus).toBe("pending");
        const pendingLog = statusChanges.find(
            (log: any) => log.metadata.status === "pending",
        );
        expect(pendingLog.metadata.previousStatus).toBe("unverified");
    });
});
