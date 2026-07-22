import { describe, it, expect } from "vitest";
import {
    GET as listMeetingsRoute,
    POST as createMeetingRoute,
} from "@/app/api/meetings/route";
import { GET as getMeetingRoute } from "@/app/api/meetings/[id]/route";
import { NotificationDelivery } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

async function createMeeting(
    headers: Record<string, string>,
    overrides: Record<string, unknown> = {},
) {
    return readJson(
        await createMeetingRoute(
            makeRequest("/api/meetings", {
                method: "POST",
                headers,
                body: {
                    title: "Họp dân quý III",
                    startTime: new Date(Date.now() + 86400000).toISOString(),
                    location: "Nhà văn hóa tổ dân phố",
                    content: "Thông qua kế hoạch quý III",
                    ...overrides,
                },
            }),
        ),
    );
}

describe("Hien thi cuoc hop nhap (draft) va thong bao khi da dang", () => {
    it("cuoc hop chua published khong xuat hien trong danh sach cong khai, nhung co trong danh sach admin", async () => {
        const secretary = await createTestUser({ roles: ["secretary"] });
        const secretaryHeaders = await authHeaders(secretary);
        const created = await createMeeting(secretaryHeaders);
        expect(created.data.published).toBe(false);

        const publicList = await readJson(
            await listMeetingsRoute(makeRequest("/api/meetings")),
        );
        expect(
            publicList.data.items.some((m: any) => m._id === created.data._id),
        ).toBe(false);

        const adminList = await readJson(
            await listMeetingsRoute(
                makeRequest("/api/meetings?admin=1", { headers: secretaryHeaders }),
            ),
        );
        expect(
            adminList.data.items.some((m: any) => m._id === created.data._id),
        ).toBe(true);
    });

    it("khong xem duoc chi tiet cuoc hop nhap qua GET cong khai, nhan vien co quyen meetings.read thi xem duoc", async () => {
        const secretary = await createTestUser({ roles: ["secretary"] });
        const resident = await createTestUser({ roles: ["resident"] });
        const created = await createMeeting(await authHeaders(secretary));

        const asResident = await getMeetingRoute(
            makeRequest(`/api/meetings/${created.data._id}`, {
                headers: await authHeaders(resident),
            }),
            { params: { id: created.data._id } },
        );
        expect(asResident.status).toBe(404);

        const asSecretary = await getMeetingRoute(
            makeRequest(`/api/meetings/${created.data._id}`, {
                headers: await authHeaders(secretary),
            }),
            { params: { id: created.data._id } },
        );
        expect(asSecretary.status).toBe(200);
    });

    it("cuoc hop duoc tao voi published=true se hien cong khai va gui thong bao toi resident", async () => {
        const secretary = await createTestUser({ roles: ["secretary"] });
        const resident = await createTestUser({ roles: ["resident"] });
        const created = await createMeeting(await authHeaders(secretary), {
            published: true,
        });
        expect(created.data.published).toBe(true);

        const publicList = await readJson(
            await listMeetingsRoute(makeRequest("/api/meetings")),
        );
        expect(
            publicList.data.items.some((m: any) => m._id === created.data._id),
        ).toBe(true);

        const delivery = await NotificationDelivery.findOne({
            userId: resident._id,
        });
        expect(delivery).toBeTruthy();
    });
});
