import { describe, it, expect } from "vitest";
import {
    POST as createComplaintRoute,
    GET as listComplaintsRoute,
} from "@/app/api/complaints/route";
import { GET as getComplaintRoute } from "@/app/api/complaints/[id]/route";
import { GET as listMineRoute } from "@/app/api/complaints/mine/route";
import { Complaint } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createComplaintAs(
    userId: string,
    headers: Record<string, string>,
) {
    const res = await createComplaintRoute(
        makeRequest("/api/complaints", {
            method: "POST",
            headers,
            body: {
                category: "ve_sinh_moi_truong",
                title: "Rác thải tồn đọng ở ngõ 12",
                content:
                    "Rác không được thu gom nhiều ngày nay, gây mùi khó chịu.",
            },
        }),
    );
    return readJson(res);
}

describe("Quyen so huu phan anh (complaint ownership)", () => {
    it("chu phan anh xem duoc chi tiet phan anh cua chinh minh", async () => {
        const owner = await createTestUser({ roles: ["resident"] });
        const ownerHeaders = await authHeaders(owner);
        const created = await createComplaintAs(
            String(owner._id),
            ownerHeaders,
        );

        const res = await getComplaintRoute(
            makeRequest(`/api/complaints/${created.data._id}`, {
                headers: ownerHeaders,
            }),
            { params: { id: created.data._id } },
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.complaint._id).toBe(created.data._id);
    });

    it("nguoi dan khac khong the xem chi tiet phan anh khong phai cua minh", async () => {
        const owner = await createTestUser({ roles: ["resident"] });
        const stranger = await createTestUser({ roles: ["resident"] });
        const created = await createComplaintAs(
            String(owner._id),
            await authHeaders(owner),
        );

        const res = await getComplaintRoute(
            makeRequest(`/api/complaints/${created.data._id}`, {
                headers: await authHeaders(stranger),
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(403);
    });

    it("can bo (staff) duoc xem chi tiet phan anh cua nguoi khac", async () => {
        const owner = await createTestUser({ roles: ["resident"] });
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const created = await createComplaintAs(
            String(owner._id),
            await authHeaders(owner),
        );

        const res = await getComplaintRoute(
            makeRequest(`/api/complaints/${created.data._id}`, {
                headers: await authHeaders(leader),
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(200);
    });

    it("can bo (staff) khong co quyen complaints.create khong the gui phan anh", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const res = await createComplaintRoute(
            makeRequest("/api/complaints", {
                method: "POST",
                headers: await authHeaders(leader),
                body: {
                    category: "ve_sinh_moi_truong",
                    title: "Rác thải tồn đọng ở ngõ 12",
                    content: "Rác không được thu gom nhiều ngày nay.",
                },
            }),
        );
        expect(res.status).toBe(403);
    });

    it("GET /api/complaints/mine chi tra ve phan anh cua nguoi dang dang nhap", async () => {
        const userA = await createTestUser({ roles: ["resident"] });
        const userB = await createTestUser({ roles: ["resident"] });
        await createComplaintAs(String(userA._id), await authHeaders(userA));
        await createComplaintAs(String(userB._id), await authHeaders(userB));

        const res = await listMineRoute(
            makeRequest("/api/complaints/mine", {
                headers: await authHeaders(userA),
            }),
        );
        const json = await readJson(res);
        expect(json.data.items).toHaveLength(1);
        expect(String(json.data.items[0].createdByUserId)).toBe(
            String(userA._id),
        );
    });

    it("to truong duoc gan cum khong xem duoc phan anh cua cum khac (chi tiet + danh sach)", async () => {
        const owner = await createTestUser({
            roles: ["resident"],
            assignedClusters: ["Cum 2"],
        });
        const leader = await createTestUser({
            roles: ["neighborhood_leader"],
            assignedClusters: ["Cum 1"],
        });
        const created = await createComplaintAs(
            String(owner._id),
            await authHeaders(owner),
        );

        const detailRes = await getComplaintRoute(
            makeRequest(`/api/complaints/${created.data._id}`, {
                headers: await authHeaders(leader),
            }),
            { params: { id: created.data._id } },
        );
        expect(detailRes.status).toBe(403);

        const listRes = await listComplaintsRoute(
            makeRequest("/api/complaints", {
                headers: await authHeaders(leader),
            }),
        );
        const listJson = await readJson(listRes);
        expect(
            listJson.data.items.map((item: any) => String(item._id)),
        ).not.toContain(String(created.data._id));
    });

    it("can bo UBND co complaints.read_escalated chi xem duoc phan anh cum khac sau khi da chuyen UBND", async () => {
        const owner = await createTestUser({
            roles: ["resident"],
            assignedClusters: ["Cum 2"],
        });
        const committee = await createTestUser({
            roles: ["people_committee_official"],
            assignedClusters: ["Cum 1"],
            permissions: ["complaints.read_escalated"],
        });
        const created = await createComplaintAs(
            String(owner._id),
            await authHeaders(owner),
        );

        const before = await getComplaintRoute(
            makeRequest(`/api/complaints/${created.data._id}`, {
                headers: await authHeaders(committee),
            }),
            { params: { id: created.data._id } },
        );
        expect(before.status).toBe(403);

        await Complaint.findByIdAndUpdate(created.data._id, {
            escalatedToCommittee: true,
        });

        const after = await getComplaintRoute(
            makeRequest(`/api/complaints/${created.data._id}`, {
                headers: await authHeaders(committee),
            }),
            { params: { id: created.data._id } },
        );
        expect(after.status).toBe(200);
    });
});
