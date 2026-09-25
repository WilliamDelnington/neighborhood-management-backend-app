import { describe, it, expect } from "vitest";
import { POST as createHolidayRoute } from "@/app/api/appointment-holidays/route";
import { PATCH as updateServiceRoute } from "@/app/api/appointment-services/[id]/route";
import { POST as createAppointmentRoute } from "@/app/api/appointments/route";
import { GET as availableSlotsRoute } from "@/app/api/appointments/available-slots/route";
import { AppointmentService, HouseRecord } from "@/models";
import { createTestUser, authHeaders, makeRequest, readJson } from "../helpers";

function isoDayOfWeek(date: Date): number {
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
}

function addDays(base: Date, days: number): Date {
    const result = new Date(base);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

const toDateOnlyString = (date: Date): string => date.toISOString().slice(0, 10);

const bookingDateStr = toDateOnlyString(addDays(new Date(), 7));
const nextDayStr = toDateOnlyString(addDays(new Date(), 8));
const slotDayOfWeek = isoDayOfWeek(new Date(bookingDateStr));

async function createService() {
    const service = await AppointmentService.create({
        key: `svc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: "Dich vu test",
        locationAddress: "UBND Phường Test",
        scope: "ward",
        wardCode: 9999,
        autoApprove: true,
        assignedOfficerUserIds: [],
        timeSlots: [
            {
                dayOfWeek: slotDayOfWeek,
                startTime: "09:00",
                endTime: "10:00",
                maxCapacity: 10,
                active: true,
            },
        ],
        active: true,
    });
    return { service, regularSlotId: String(service.timeSlots[0]._id) };
}

async function createHouse() {
    return HouseRecord.create({
        code: `HR-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        cluster: "Cụm Test",
        address: "Số 1, Cụm Test",
        status: "verified",
    });
}

async function patchService(
    headers: Record<string, string>,
    id: string,
    body: Record<string, unknown>,
) {
    return updateServiceRoute(
        makeRequest(`/api/appointment-services/${id}`, {
            method: "PATCH",
            headers,
            body,
        }),
        { params: { id } },
    );
}

async function slotsFor(headers: Record<string, string>, serviceId: string, date: string) {
    const res = await availableSlotsRoute(
        makeRequest(
            `/api/appointments/available-slots?serviceId=${serviceId}&date=${date}`,
            { headers },
        ),
    );
    return (await readJson(res)).data as { slot_id: string; start_time: string }[];
}

async function book(
    headers: Record<string, string>,
    serviceId: string,
    houseId: string,
    timeSlotId: string,
    appointedDate: string,
) {
    return createAppointmentRoute(
        makeRequest("/api/appointments", {
            method: "POST",
            headers,
            body: { serviceId, houseId, timeSlotId, appointedDate },
        }),
    );
}

describe("Ngay ngoai le rieng cua dich vu hen lich", () => {
    it("ngoai le 'closed' dong dich vu trong khoang ngay va chan dat lich", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, regularSlotId } = await createService();
        const house = await createHouse();

        const patchRes = await patchService(headers, String(service._id), {
            exceptions: [
                {
                    date: bookingDateStr,
                    endDate: nextDayStr,
                    type: "closed",
                    note: "Bảo trì hệ thống",
                },
            ],
        });
        expect(patchRes.status).toBe(200);

        expect(await slotsFor(headers, String(service._id), bookingDateStr)).toEqual([]);

        const bookRes = await book(
            headers,
            String(service._id),
            String(house._id),
            regularSlotId,
            bookingDateStr,
        );
        expect(bookRes.status).toBe(422);
        expect((await readJson(bookRes)).message).toContain("Bảo trì hệ thống");
    });

    it("ngoai le 'custom_hours' thay khung gio thuong, ke ca vao ngay nghi/le chung", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, regularSlotId } = await createService();
        const house = await createHouse();

        await createHolidayRoute(
            makeRequest("/api/appointment-holidays", {
                method: "POST",
                headers,
                body: { date: bookingDateStr, name: "Ngày lễ (test)", type: "le" },
            }),
        );
        await patchService(headers, String(service._id), {
            exceptions: [
                {
                    date: bookingDateStr,
                    type: "custom_hours",
                    note: "Trực lễ buổi sáng",
                    timeSlots: [
                        { startTime: "08:00", endTime: "08:30", maxCapacity: 2 },
                    ],
                },
            ],
        });

        const slots = await slotsFor(headers, String(service._id), bookingDateStr);
        expect(slots).toHaveLength(1);
        expect(slots[0].start_time).toBe("08:00");

        // Khung gio thuong khong con ap dung cho ngay nay.
        const regularRes = await book(
            headers,
            String(service._id),
            String(house._id),
            regularSlotId,
            bookingDateStr,
        );
        expect(regularRes.status).toBe(422);

        const customRes = await book(
            headers,
            String(service._id),
            String(house._id),
            slots[0].slot_id,
            bookingDateStr,
        );
        expect(customRes.status).toBe(201);
        expect((await readJson(customRes)).data.startTime).toBe("08:00");
    });

    it("tu choi hai ngoai le chong lan ngay nhau", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service } = await createService();

        const res = await patchService(headers, String(service._id), {
            exceptions: [
                { date: bookingDateStr, endDate: nextDayStr, type: "closed" },
                {
                    date: nextDayStr,
                    type: "custom_hours",
                    timeSlots: [{ startTime: "08:00", endTime: "09:00" }],
                },
            ],
        });
        expect(res.status).toBe(422);
    });

    it("giu nguyen id khung gio khi gui kem _id luc sua", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, regularSlotId } = await createService();

        const res = await patchService(headers, String(service._id), {
            timeSlots: [
                {
                    _id: regularSlotId,
                    dayOfWeek: slotDayOfWeek,
                    startTime: "09:00",
                    endTime: "11:00",
                    maxCapacity: 10,
                },
            ],
        });
        expect(res.status).toBe(200);
        const reloaded = await AppointmentService.findById(service._id);
        expect(String(reloaded!.timeSlots[0]._id)).toBe(regularSlotId);
        expect(reloaded!.timeSlots[0].endTime).toBe("11:00");
    });
});
