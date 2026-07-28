import { describe, it, expect } from "vitest";
import { POST as createMeetingRoute } from "@/app/api/meetings/route";
import {
    POST as registerRoute,
    GET as listRegistrationsRoute,
} from "@/app/api/meetings/[id]/register/route";
import { MeetingRegistration } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

describe("Dang ky tham du cuoc hop - duy nhat theo meetingId + userId", () => {
    it("dang ky lai se cap nhat ban ghi cu thay vi tao ban ghi trung lap", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const houseOwner = await createTestUser({ roles: ["house_owner"] });
        const leaderHeaders = await authHeaders(leader);
        const houseOwnerHeaders = await authHeaders(houseOwner);

        const meetingRes = await readJson(
            await createMeetingRoute(
                makeRequest("/api/meetings", {
                    method: "POST",
                    headers: leaderHeaders,
                    body: {
                        title: "Họp dân quý III",
                        startTime: new Date(
                            Date.now() + 86400000,
                        ).toISOString(),
                        location: "Nhà văn hóa tổ dân phố",
                        content: "Thông qua kế hoạch quý III",
                    },
                }),
            ),
        );
        const meetingId = meetingRes.data._id;

        const firstRegister = await registerRoute(
            makeRequest(`/api/meetings/${meetingId}/register`, {
                method: "POST",
                headers: houseOwnerHeaders,
                body: { answer: "khong" },
            }),
            { params: { id: meetingId } },
        );
        expect(firstRegister.status).toBe(200);

        const secondRegister = await registerRoute(
            makeRequest(`/api/meetings/${meetingId}/register`, {
                method: "POST",
                headers: houseOwnerHeaders,
                body: { answer: "co" },
            }),
            { params: { id: meetingId } },
        );
        expect(secondRegister.status).toBe(200);

        const count = await MeetingRegistration.countDocuments({
            meetingId,
            userId: String(houseOwner._id),
        });
        expect(count).toBe(1);

        const listRes = await readJson(
            await listRegistrationsRoute(
                makeRequest(`/api/meetings/${meetingId}/register`, {
                    headers: leaderHeaders,
                }),
                { params: { id: meetingId } },
            ),
        );
        expect(listRes.data.items).toHaveLength(1);
        expect(listRes.data.items[0].answer).toBe("co");
    });

    it("chi can bo moi duoc xem danh sach dang ky tham du", async () => {
        const leader = await createTestUser({ roles: ["neighborhood_leader"] });
        const houseOwner = await createTestUser({ roles: ["house_owner"] });

        const meetingRes = await readJson(
            await createMeetingRoute(
                makeRequest("/api/meetings", {
                    method: "POST",
                    headers: await authHeaders(leader),
                    body: {
                        title: "Họp dân quý IV",
                        startTime: new Date(
                            Date.now() + 86400000,
                        ).toISOString(),
                        location: "Nhà văn hóa tổ dân phố",
                        content: "Nội dung họp",
                    },
                }),
            ),
        );
        const meetingId = meetingRes.data._id;

        const res = await listRegistrationsRoute(
            makeRequest(`/api/meetings/${meetingId}/register`, {
                headers: await authHeaders(houseOwner),
            }),
            { params: { id: meetingId } },
        );
        expect(res.status).toBe(403);
    });
});
