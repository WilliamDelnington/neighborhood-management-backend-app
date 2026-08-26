import { describe, it, expect } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import {
    POST as createTermRoute,
    GET as listTermsRoute,
} from "@/app/api/neighborhoods/[id]/terms/route";
import {
    PATCH as updateTermRoute,
    DELETE as deleteTermRoute,
} from "@/app/api/neighborhoods/[id]/terms/[termId]/route";
import { POST as cancelTermRoute } from "@/app/api/neighborhoods/[id]/terms/[termId]/cancel/route";
import { POST as endTermEarlyRoute } from "@/app/api/neighborhoods/[id]/terms/[termId]/end-early/route";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createNeighborhood(
    headers: Record<string, string>,
    code: string,
    sequence: number,
) {
    return readJson(
        await createNeighborhoodRoute(
            makeRequest("/api/neighborhoods", {
                method: "POST",
                headers,
                body: {
                    name: `Tổ dân phố ${code}`,
                    code,
                    sequence,
                    provinceCode: 79,
                    provinceName: "TP Hồ Chí Minh",
                    wardCode: 26734,
                    wardName: "Phường thử nghiệm",
                },
            }),
        ),
    );
}

async function createTerm(
    headers: Record<string, string>,
    neighborhoodId: string,
    body: Record<string, unknown>,
) {
    const res = await createTermRoute(
        makeRequest(`/api/neighborhoods/${neighborhoodId}/terms`, {
            method: "POST",
            headers,
            body,
        }),
        { params: { id: neighborhoodId } },
    );
    return { res, json: await readJson(res) };
}

async function updateTerm(
    headers: Record<string, string>,
    neighborhoodId: string,
    termId: string,
    body: Record<string, unknown>,
) {
    const res = await updateTermRoute(
        makeRequest(`/api/neighborhoods/${neighborhoodId}/terms/${termId}`, {
            method: "PATCH",
            headers,
            body,
        }),
        { params: { id: neighborhoodId, termId } },
    );
    return { res, json: await readJson(res) };
}

describe("Vong doi nhiem ky (DRAFT/NOT_STARTED/IN_PROGRESS/ENDED/CANCELLED)", () => {
    it("tao voi saveAsDraft:true -> luon DRAFT bat ke ngay thang", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-01", 601);

        const { res, json } = await createTerm(headers, n.data._id, {
            name: "Nhiệm kỳ nháp",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
            saveAsDraft: true,
        });
        expect(res.status).toBe(201);
        expect(json.data.status).toBe("DRAFT");
    });

    it("tao voi startAt tuong lai, khong luu nhap -> NOT_STARTED", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-02", 602);

        const { res, json } = await createTerm(headers, n.data._id, {
            name: "Nhiệm kỳ tương lai",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
        });
        expect(res.status).toBe(201);
        expect(json.data.status).toBe("NOT_STARTED");
    });

    it("tao voi startAt qua khu, endAt tuong lai -> IN_PROGRESS", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-03", 603);

        const { res, json } = await createTerm(headers, n.data._id, {
            name: "Nhiệm kỳ đang chạy",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
        });
        expect(res.status).toBe(201);
        expect(json.data.status).toBe("IN_PROGRESS");
    });

    it("tao voi ca startAt va endAt deu qua khu -> ENDED (endedEarly=false)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-04", 604);

        const { res, json } = await createTerm(headers, n.data._id, {
            name: "Nhiệm kỳ đã cũ",
            startAt: "2020-01-01",
            endAt: "2020-12-31",
        });
        expect(res.status).toBe(201);
        expect(json.data.status).toBe("ENDED");
        expect(json.data.endedEarly).toBe(false);
    });

    it("sua thong tin DRAFT (khong finalize) -> van la DRAFT", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-05", 605);
        const draft = await createTerm(headers, n.data._id, {
            name: "Ban nhap A",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
            saveAsDraft: true,
        });

        const { res, json } = await updateTerm(
            headers,
            n.data._id,
            draft.json.data._id,
            { name: "Ban nhap A (sua)" },
        );
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("DRAFT");
        expect(json.data.name).toBe("Ban nhap A (sua)");
    });

    it("sua DRAFT voi finalize:true, startAt tuong lai -> chuyen sang NOT_STARTED", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-06", 606);
        const draft = await createTerm(headers, n.data._id, {
            name: "Ban nhap B",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
            saveAsDraft: true,
        });

        const { res, json } = await updateTerm(
            headers,
            n.data._id,
            draft.json.data._id,
            { finalize: true },
        );
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("NOT_STARTED");
    });

    it("khong the sua thong tin nhiem ky dang IN_PROGRESS (409)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-07", 607);
        const term = await createTerm(headers, n.data._id, {
            name: "Đang chạy C",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
        });

        const { res } = await updateTerm(
            headers,
            n.data._id,
            term.json.data._id,
            { name: "Đổi tên" },
        );
        expect(res.status).toBe(409);
    });

    it("xoa duoc nhiem ky DRAFT, khong con trong danh sach", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-08", 608);
        const draft = await createTerm(headers, n.data._id, {
            name: "Ban nhap D",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
            saveAsDraft: true,
        });

        const delRes = await deleteTermRoute(
            makeRequest(
                `/api/neighborhoods/${n.data._id}/terms/${draft.json.data._id}`,
                { method: "DELETE", headers },
            ),
            { params: { id: n.data._id, termId: draft.json.data._id } },
        );
        expect(delRes.status).toBe(200);

        const listRes = await listTermsRoute(
            makeRequest(`/api/neighborhoods/${n.data._id}/terms`, { headers }),
            { params: { id: n.data._id } },
        );
        const listJson = await readJson(listRes);
        expect(listJson.data).toHaveLength(0);
    });

    it("khong the xoa nhiem ky NOT_STARTED (409) - chi huy duoc", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-09", 609);
        const term = await createTerm(headers, n.data._id, {
            name: "Chưa bắt đầu E",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
        });

        const delRes = await deleteTermRoute(
            makeRequest(
                `/api/neighborhoods/${n.data._id}/terms/${term.json.data._id}`,
                { method: "DELETE", headers },
            ),
            { params: { id: n.data._id, termId: term.json.data._id } },
        );
        expect(delRes.status).toBe(409);
    });

    it("huy duoc nhiem ky NOT_STARTED (khong can ly do) -> CANCELLED", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-10", 610);
        const term = await createTerm(headers, n.data._id, {
            name: "Chưa bắt đầu F",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
        });

        const res = await cancelTermRoute(
            makeRequest(
                `/api/neighborhoods/${n.data._id}/terms/${term.json.data._id}/cancel`,
                { method: "POST", headers },
            ),
            { params: { id: n.data._id, termId: term.json.data._id } },
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.status).toBe("CANCELLED");
    });

    it("khong the huy nhiem ky DRAFT hoac IN_PROGRESS (chi NOT_STARTED)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-11", 611);
        const draft = await createTerm(headers, n.data._id, {
            name: "Ban nhap G",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
            saveAsDraft: true,
        });
        const inProgress = await createTerm(headers, n.data._id, {
            name: "Đang chạy G",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
        });

        const cancelDraft = await cancelTermRoute(
            makeRequest(
                `/api/neighborhoods/${n.data._id}/terms/${draft.json.data._id}/cancel`,
                { method: "POST", headers },
            ),
            { params: { id: n.data._id, termId: draft.json.data._id } },
        );
        expect(cancelDraft.status).toBe(409);

        const cancelActive = await cancelTermRoute(
            makeRequest(
                `/api/neighborhoods/${n.data._id}/terms/${inProgress.json.data._id}/cancel`,
                { method: "POST", headers },
            ),
            { params: { id: n.data._id, termId: inProgress.json.data._id } },
        );
        expect(cancelActive.status).toBe(409);
    });

    it("ket thuc som (end-early) yeu cau ly do bat buoc (422 neu thieu)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-12", 612);
        const term = await createTerm(headers, n.data._id, {
            name: "Đang chạy H",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
        });

        const res = await endTermEarlyRoute(
            makeRequest(
                `/api/neighborhoods/${n.data._id}/terms/${term.json.data._id}/end-early`,
                { method: "POST", headers, body: {} },
            ),
            { params: { id: n.data._id, termId: term.json.data._id } },
        );
        expect(res.status).toBe(422);
    });

    it("ket thuc som thanh cong -> ENDED, endedEarly=true, luu ly do", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-13", 613);
        const term = await createTerm(headers, n.data._id, {
            name: "Đang chạy I",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
        });

        const res = await endTermEarlyRoute(
            makeRequest(
                `/api/neighborhoods/${n.data._id}/terms/${term.json.data._id}/end-early`,
                {
                    method: "POST",
                    headers,
                    body: { reason: "Tổ trưởng chuyển nơi ở" },
                },
            ),
            { params: { id: n.data._id, termId: term.json.data._id } },
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.status).toBe("ENDED");
        expect(json.data.endedEarly).toBe(true);
        expect(json.data.endReason).toBe("Tổ trưởng chuyển nơi ở");
    });

    it("khong the ket thuc som nhiem ky chua bat dau (409)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-14", 614);
        const term = await createTerm(headers, n.data._id, {
            name: "Chưa bắt đầu J",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
        });

        const res = await endTermEarlyRoute(
            makeRequest(
                `/api/neighborhoods/${n.data._id}/terms/${term.json.data._id}/end-early`,
                { method: "POST", headers, body: { reason: "Lý do bất kỳ" } },
            ),
            { params: { id: n.data._id, termId: term.json.data._id } },
        );
        expect(res.status).toBe(409);
    });

    it("khong tao duoc nhiem ky IN_PROGRESS thu hai khi da co mot nhiem ky IN_PROGRESS (409)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-15", 615);
        await createTerm(headers, n.data._id, {
            name: "Đang chạy K1",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
        });

        const { res } = await createTerm(headers, n.data._id, {
            name: "Đang chạy K2",
            startAt: "2026-06-01",
            endAt: "2028-12-31",
        });
        expect(res.status).toBe(409);
    });

    it("khong finalize duoc DRAFT thanh IN_PROGRESS khi da co nhiem ky IN_PROGRESS khac (409)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "TL-16", 616);
        await createTerm(headers, n.data._id, {
            name: "Đang chạy L1",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
        });
        const draft = await createTerm(headers, n.data._id, {
            name: "Ban nhap L2",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
            saveAsDraft: true,
        });

        const { res } = await updateTerm(
            headers,
            n.data._id,
            draft.json.data._id,
            { finalize: true },
        );
        expect(res.status).toBe(409);
    });
});
