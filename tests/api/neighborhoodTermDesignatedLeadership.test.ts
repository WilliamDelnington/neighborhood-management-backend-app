import { describe, it, expect } from "vitest";
import { POST as createNeighborhoodRoute } from "@/app/api/neighborhoods/route";
import { POST as createTermRoute } from "@/app/api/neighborhoods/[id]/terms/route";
import { PATCH as updateTermRoute } from "@/app/api/neighborhoods/[id]/terms/[termId]/route";
import {
    Neighborhood,
    NeighborhoodLeaderAssignment,
    NeighborhoodColeaderAssignment,
    NeighborhoodTerm,
} from "@/models";
import { expireNeighborhoodOfficerAssignments } from "@/services/neighborhoodService";
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

describe("Chi dinh to truong/to pho ngay tren form tao/sua nhiem ky", () => {
    it("tao nhiem ky IN_PROGRESS ngay kem to truong -> tao phan cong thuc su luon", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const n = await createNeighborhood(adminHeaders, "DL-01", 801);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        const { res, json } = await createTerm(adminHeaders, n.data._id, {
            name: "Nhiệm kỳ có tổ trưởng",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
            leaderUserId: String(leader._id),
        });
        expect(res.status).toBe(201);
        expect(json.data.status).toBe("IN_PROGRESS");
        expect(json.data.leaderUserId._id).toBe(String(leader._id));

        const neighborhood = await Neighborhood.findById(n.data._id);
        expect(String(neighborhood!.leaderUserId)).toBe(String(leader._id));
        const assignment = await NeighborhoodLeaderAssignment.findOne({
            neighborhoodId: n.data._id,
            unassignedAt: { $exists: false },
        });
        expect(assignment).not.toBeNull();
        expect(String(assignment!.termId)).toBe(json.data._id);
    });

    it("tao nhiem ky IN_PROGRESS kem to pho -> tao phan cong to pho thuc su", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const n = await createNeighborhood(adminHeaders, "DL-02", 802);
        const coleader = await createTestUser({
            roles: ["neighborhood_coleader"],
        });

        const { res, json } = await createTerm(adminHeaders, n.data._id, {
            name: "Nhiệm kỳ có tổ phó",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
            coleaderUserId: String(coleader._id),
        });
        expect(res.status).toBe(201);
        expect(json.data.coleaderUserId._id).toBe(String(coleader._id));

        const assignment = await NeighborhoodColeaderAssignment.findOne({
            neighborhoodId: n.data._id,
            unassignedAt: { $exists: false },
        });
        expect(assignment).not.toBeNull();
        expect(String(assignment!.coleaderUserId)).toBe(String(coleader._id));
    });

    it("tao nhiem ky NOT_STARTED kem to truong -> chi luu du dinh, CHUA tao phan cong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const n = await createNeighborhood(adminHeaders, "DL-03", 803);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        const { res, json } = await createTerm(adminHeaders, n.data._id, {
            name: "Nhiệm kỳ tương lai có tổ trưởng",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
            leaderUserId: String(leader._id),
        });
        expect(res.status).toBe(201);
        expect(json.data.status).toBe("NOT_STARTED");
        expect(json.data.leaderUserId._id).toBe(String(leader._id));

        const neighborhood = await Neighborhood.findById(n.data._id);
        expect(neighborhood!.leaderUserId).toBeUndefined();
        const assignment = await NeighborhoodLeaderAssignment.findOne({
            neighborhoodId: n.data._id,
        });
        expect(assignment).toBeNull();
    });

    it("chi dinh nguoi khong co vai tro Tổ trưởng bi tu choi (422), khong tao nhiem ky", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const n = await createNeighborhood(adminHeaders, "DL-04", 804);
        const notLeader = await createTestUser({ roles: ["house_owner"] });

        const { res } = await createTerm(adminHeaders, n.data._id, {
            name: "Nhiệm kỳ sai vai trò",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
            leaderUserId: String(notLeader._id),
        });
        expect(res.status).toBe(422);

        const term = await NeighborhoodTerm.findOne({
            neighborhoodId: n.data._id,
        });
        expect(term).toBeNull();
    });

    it("luu nhap kem to truong -> van la DRAFT, chua tao phan cong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const n = await createNeighborhood(adminHeaders, "DL-05", 805);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        const { res, json } = await createTerm(adminHeaders, n.data._id, {
            name: "Ban nháp có tổ trưởng",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
            leaderUserId: String(leader._id),
            saveAsDraft: true,
        });
        expect(res.status).toBe(201);
        expect(json.data.status).toBe("DRAFT");

        const assignment = await NeighborhoodLeaderAssignment.findOne({
            neighborhoodId: n.data._id,
        });
        expect(assignment).toBeNull();
    });

    it("finalize mot ban nhap co to truong, da qua ngay bat dau -> tao phan cong thuc su", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const n = await createNeighborhood(adminHeaders, "DL-06", 806);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        const draft = await createTerm(adminHeaders, n.data._id, {
            name: "Ban nháp sẽ công bố",
            startAt: "2026-01-01",
            endAt: "2028-12-31",
            leaderUserId: String(leader._id),
            saveAsDraft: true,
        });

        const { res, json } = await updateTerm(
            adminHeaders,
            n.data._id,
            draft.json.data._id,
            { finalize: true },
        );
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("IN_PROGRESS");

        const assignment = await NeighborhoodLeaderAssignment.findOne({
            neighborhoodId: n.data._id,
            unassignedAt: { $exists: false },
        });
        expect(assignment).not.toBeNull();
        expect(String(assignment!.leaderUserId)).toBe(String(leader._id));
    });

    it("sua to truong cua nhiem ky NOT_STARTED (truoc khi bat dau) -> chi cap nhat du dinh, chua gan", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const n = await createNeighborhood(adminHeaders, "DL-07", 807);
        const leaderA = await createTestUser({ roles: ["neighborhood_leader"] });
        const leaderB = await createTestUser({ roles: ["neighborhood_leader"] });

        const term = await createTerm(adminHeaders, n.data._id, {
            name: "Nhiệm kỳ tương lai đổi tổ trưởng",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
            leaderUserId: String(leaderA._id),
        });

        const { res, json } = await updateTerm(
            adminHeaders,
            n.data._id,
            term.json.data._id,
            { leaderUserId: String(leaderB._id) },
        );
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("NOT_STARTED");
        expect(json.data.leaderUserId._id).toBe(String(leaderB._id));

        const assignment = await NeighborhoodLeaderAssignment.findOne({
            neighborhoodId: n.data._id,
        });
        expect(assignment).toBeNull();
    });

    it("vong quet tu dong: nhiem ky NOT_STARTED qua han bat dau tu chuyen IN_PROGRESS va tu gan to truong da chi dinh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const adminHeaders = await authHeaders(admin);
        const n = await createNeighborhood(adminHeaders, "DL-08", 808);
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });

        const term = await createTerm(adminHeaders, n.data._id, {
            name: "Nhiệm kỳ sắp tự động bắt đầu",
            startAt: "2099-01-01",
            endAt: "2099-12-31",
            leaderUserId: String(leader._id),
        });
        expect(term.json.data.status).toBe("NOT_STARTED");

        // Gia lap thoi gian troi qua: dua startAt ve qua khu truc tiep trong DB
        // (khong the sua qua API vi nhiem ky da chi dinh van con NOT_STARTED
        // - PATCH van cho phep sua ngay o trang thai nay, nhung o day muon mo
        // phong vong quet tu dong nen ghi thang xuong DB).
        await NeighborhoodTerm.updateOne(
            { _id: term.json.data._id },
            { $set: { startAt: new Date("2020-01-01") } },
        );

        await expireNeighborhoodOfficerAssignments();

        const refreshedTerm = await NeighborhoodTerm.findById(term.json.data._id);
        expect(refreshedTerm!.status).toBe("IN_PROGRESS");

        const neighborhood = await Neighborhood.findById(n.data._id);
        expect(String(neighborhood!.leaderUserId)).toBe(String(leader._id));
        const assignment = await NeighborhoodLeaderAssignment.findOne({
            neighborhoodId: n.data._id,
            unassignedAt: { $exists: false },
        });
        expect(assignment).not.toBeNull();
        expect(String(assignment!.termId)).toBe(term.json.data._id);
    });
});
