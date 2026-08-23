import { describe, it, expect } from "vitest";
import {
    POST as createHolidayRoute,
} from "@/app/api/appointment-holidays/route";
import {
    POST as createAppointmentRoute,
} from "@/app/api/appointments/route";
import {
    GET as availableSlotsRoute,
} from "@/app/api/appointments/available-slots/route";
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

function toDateOnlyString(date: Date): string {
    return date.toISOString().slice(0, 10);
}

const bookingDateStr = toDateOnlyString(addDays(new Date(), 7));
const bookingDate = new Date(bookingDateStr);
const slotDayOfWeek = isoDayOfWeek(bookingDate);

async function createService(wardCode = 9999) {
    const service = await AppointmentService.create({
        key: `svc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: "Dich vu test",
        locationAddress: "UBND Phường Test",
        scope: "ward",
        wardCode,
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
    return { service, slotId: String(service.timeSlots[0]._id) };
}

async function createHouse() {
    return HouseRecord.create({
        code: `HR-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        cluster: "Cụm Test",
        address: "Số 1, Cụm Test",
        status: "verified",
    });
}

describe("POST /api/appointment-holidays", () => {
    it("tao ngay nghi thanh cong, tu choi neu trung ngay+pham vi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);

        const res = await createHolidayRoute(
            makeRequest("/api/appointment-holidays", {
                method: "POST",
                headers,
                body: {
                    date: bookingDateStr,
                    name: "Ngày nghỉ thử nghiệm",
                    type: "le",
                },
            }),
        );
        expect(res.status).toBe(201);

        const duplicateRes = await createHolidayRoute(
            makeRequest("/api/appointment-holidays", {
                method: "POST",
                headers,
                body: {
                    date: bookingDateStr,
                    name: "Trùng ngày",
                    type: "tam_ngung",
                },
            }),
        );
        expect(duplicateRes.status).toBe(409);
    });
});

describe("Ngay nghi chan dat lich (19.2.8/19.2.9)", () => {
    it("getAvailableSlots tra ve rong va createAppointment bi tu choi vao ngay nghi toan he thong", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, slotId } = await createService();
        const house = await createHouse();

        await createHolidayRoute(
            makeRequest("/api/appointment-holidays", {
                method: "POST",
                headers,
                body: {
                    date: bookingDateStr,
                    name: "Tết Dương lịch (test)",
                    type: "le",
                },
            }),
        );

        const slotsRes = await availableSlotsRoute(
            makeRequest(
                `/api/appointments/available-slots?serviceId=${service._id}&date=${bookingDateStr}`,
                { headers },
            ),
        );
        const slotsJson = await readJson(slotsRes);
        expect(slotsRes.status).toBe(200);
        expect(slotsJson.data).toEqual([]);

        const bookRes = await createAppointmentRoute(
            makeRequest("/api/appointments", {
                method: "POST",
                headers,
                body: {
                    serviceId: String(service._id),
                    houseId: String(house._id),
                    timeSlotId: slotId,
                    appointedDate: bookingDateStr,
                },
            }),
        );
        const bookJson = await readJson(bookRes);
        expect(bookRes.status).toBe(422);
        expect(bookJson.message).toContain("Tết Dương lịch (test)");
    });

    it("ngay nghi rieng cua mot phuong khong anh huong phuong khac", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const wardStaff = await createTestUser({
            roles: ["people_committee_official"],
            wardCode: 1111,
            permissions: ["appointments.manage"],
        });
        const wardHeaders = await authHeaders(wardStaff);

        await createHolidayRoute(
            makeRequest("/api/appointment-holidays", {
                method: "POST",
                headers: wardHeaders,
                body: {
                    date: bookingDateStr,
                    name: "Tạm ngưng riêng phường 1111",
                    type: "tam_ngung",
                },
            }),
        );

        // Dich vu thuoc phuong KHAC (9999) khong bi anh huong boi ngay tam
        // ngung rieng cua phuong 1111.
        const { service, slotId } = await createService(9999);
        const house = await createHouse();
        const res = await createAppointmentRoute(
            makeRequest("/api/appointments", {
                method: "POST",
                headers,
                body: {
                    serviceId: String(service._id),
                    houseId: String(house._id),
                    timeSlotId: slotId,
                    appointedDate: bookingDateStr,
                },
            }),
        );
        expect(res.status).toBe(201);
    });
});
