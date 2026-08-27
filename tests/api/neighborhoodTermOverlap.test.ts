import { describe, it, expect } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { POST as createTermRoute } from "@/app/api/neighborhoods/[id]/terms/route";
import { POST as endEarlyRoute } from "@/app/api/neighborhoods/[id]/terms/[termId]/end-early/route";
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

async function endEarly(
    headers: Record<string, string>,
    neighborhoodId: string,
    termId: string,
    reason = "Ly do ket thuc som de kiem thu",
) {
    const res = await endEarlyRoute(
        makeRequest(
            `/api/neighborhoods/${neighborhoodId}/terms/${termId}/end-early`,
            { method: "POST", headers, body: { reason } },
        ),
        { params: { id: neighborhoodId, termId } },
    );
    return { res, json: await readJson(res) };
}

describe("Nhiem ky trung thoi gian (cung to dan pho) va to truong doc quyen (khac to dan pho)", () => {
    it("nhiem ky A dang active -> tao nhiem ky B trung thoi gian bi tu choi (409); A ket thuc som -> B tao duoc", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const n = await createNeighborhood(headers, "OV-01", 901);

        const termA = await createTerm(headers, n.data._id, {
            name: "Nhiệm kỳ A",
            startAt: "2026-08-27",
            endAt: "2028-08-27",
        });
        expect(termA.res.status).toBe(201);
        expect(termA.json.data.status).toBe("IN_PROGRESS");

        const blockedB = await createTerm(headers, n.data._id, {
            name: "Nhiệm kỳ B",
            startAt: "2027-06-12",
            endAt: "2029-06-12",
        });
        expect(blockedB.res.status).toBe(409);

        const early = await endEarly(headers, n.data._id, termA.json.data._id);
        expect(early.res.status).toBe(200);
        expect(early.json.data.status).toBe("ENDED");
        expect(early.json.data.endedEarly).toBe(true);

        const nowAllowedB = await createTerm(headers, n.data._id, {
            name: "Nhiệm kỳ B",
            startAt: "2027-06-12",
            endAt: "2029-06-12",
        });
        expect(nowAllowedB.res.status).toBe(201);
    });

    it("Bob dang co nhiem ky A active o to B -> to C khong the chi dinh Bob lam to truong cho nhiem ky D trung thoi gian (409); A ket thuc som -> to C chi dinh duoc", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const neighborhoodB = await createNeighborhood(headers, "OV-02", 902);
        const neighborhoodC = await createNeighborhood(headers, "OV-03", 903);
        const bob = await createTestUser({ roles: ["neighborhood_leader"] });

        const termA = await createTerm(headers, neighborhoodB.data._id, {
            name: "Nhiệm kỳ A của Bob ở tổ B",
            startAt: "2026-08-27",
            endAt: "2028-08-27",
            leaderUserId: String(bob._id),
        });
        expect(termA.res.status).toBe(201);
        expect(termA.json.data.status).toBe("IN_PROGRESS");
        expect(termA.json.data.leaderUserId._id).toBe(String(bob._id));

        const blockedD = await createTerm(headers, neighborhoodC.data._id, {
            name: "Nhiệm kỳ D ở tổ C",
            startAt: "2026-12-04",
            endAt: "2028-12-04",
            leaderUserId: String(bob._id),
        });
        expect(blockedD.res.status).toBe(409);

        const early = await endEarly(
            headers,
            neighborhoodB.data._id,
            termA.json.data._id,
        );
        expect(early.res.status).toBe(200);

        const nowAllowedD = await createTerm(headers, neighborhoodC.data._id, {
            name: "Nhiệm kỳ D ở tổ C",
            startAt: "2026-12-04",
            endAt: "2028-12-04",
            leaderUserId: String(bob._id),
        });
        expect(nowAllowedD.res.status).toBe(201);
        expect(nowAllowedD.json.data.leaderUserId._id).toBe(String(bob._id));
    });

    it("Bob dang co nhiem ky A active o to B, nhung nhiem ky D o to C KHONG trung thoi gian (bat dau sau khi A ket thuc) -> chi dinh duoc ngay, khong can ket thuc som A", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const neighborhoodB = await createNeighborhood(headers, "OV-04", 904);
        const neighborhoodC = await createNeighborhood(headers, "OV-05", 905);
        const bob = await createTestUser({ roles: ["neighborhood_leader"] });

        const termA = await createTerm(headers, neighborhoodB.data._id, {
            name: "Nhiệm kỳ A của Bob ở tổ B",
            startAt: "2026-08-27",
            endAt: "2027-08-27",
            leaderUserId: String(bob._id),
        });
        expect(termA.res.status).toBe(201);
        expect(termA.json.data.status).toBe("IN_PROGRESS");

        const termD = await createTerm(headers, neighborhoodC.data._id, {
            name: "Nhiệm kỳ D ở tổ C",
            startAt: "2027-09-01",
            endAt: "2029-09-01",
            leaderUserId: String(bob._id),
        });
        expect(termD.res.status).toBe(201);
        expect(termD.json.data.status).toBe("NOT_STARTED");
        expect(termD.json.data.leaderUserId._id).toBe(String(bob._id));
    });
});
