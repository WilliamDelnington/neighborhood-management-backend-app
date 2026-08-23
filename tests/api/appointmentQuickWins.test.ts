import { describe, it, expect } from "vitest";
import {
    POST as createAppointmentRoute,
} from "@/app/api/appointments/route";
import {
    POST as rejectAppointmentRoute,
} from "@/app/api/appointments/[id]/reject/route";
import {
    GET as auditLogsRoute,
} from "@/app/api/appointments/[id]/audit-logs/route";
import {
    AppointmentService,
    HouseRecord,
    Notification,
} from "@/models";
import { checkAppointmentRemindersAndNoShow } from "@/services/appointmentService";
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

async function createService(
    overrides: { autoApprove?: boolean; description?: string } = {},
) {
    const service = await AppointmentService.create({
        key: `svc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: "Dich vu test",
        description: overrides.description,
        locationAddress: "UBND Phường Test",
        scope: "ward",
        wardCode: 9999,
        autoApprove: overrides.autoApprove ?? true,
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

describe("BR-05: gioi han lich hen chua hoan thanh tren mot cong dan", () => {
    it("tu choi dat lich thu 4 khi da co 3 lich hen chua hoan thanh", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const house = await createHouse();

        for (let i = 0; i < 3; i += 1) {
            const { service, slotId } = await createService();
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
        }

        const { service: fourthService, slotId: fourthSlotId } =
            await createService();
        const fourthRes = await createAppointmentRoute(
            makeRequest("/api/appointments", {
                method: "POST",
                headers,
                body: {
                    serviceId: String(fourthService._id),
                    houseId: String(house._id),
                    timeSlotId: fourthSlotId,
                    appointedDate: bookingDateStr,
                },
            }),
        );
        expect(fourthRes.status).toBe(409);
    });
});

describe("Tu choi lich hen goi y dat lai", () => {
    it("thong bao tu choi nhac ten dich vu de dat lai lich", async () => {
        const staff = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(staff);
        const house = await createHouse();
        const { service, slotId } = await createService({
            autoApprove: false,
        });

        const created = await readJson(
            await createAppointmentRoute(
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
            ),
        );
        expect(created.data.status).toBe("cho_xac_nhan");

        const rejectRes = await rejectAppointmentRoute(
            makeRequest(`/api/appointments/${created.data._id}/reject`, {
                method: "POST",
                headers,
                body: { reason: "Thieu ho so" },
            }),
            { params: { id: created.data._id } },
        );
        expect(rejectRes.status).toBe(200);

        const notification = await Notification.findOne({
            relatedModel: "Appointment",
            relatedId: created.data._id,
            type: "appointment.rejected",
        });
        expect(notification?.body).toContain("dat lai lich hen moi");
        expect(notification?.body).toContain(service.name);
    });
});

describe("Nhac lich 2 tier doc lap (truoc 1 ngay + truoc 2 tieng)", () => {
    it("gui rieng tung tier dung luc, khong gui trung, noi dung kem dia diem/ho so", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const house = await createHouse();
        const { service, slotId } = await createService({
            description: "CMND/CCCD ban chinh",
        });

        const created = await readJson(
            await createAppointmentRoute(
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
            ),
        );
        const appointedAt = new Date(
            bookingDate.getTime() + 9 * 3_600_000,
        ); // slot 09:00

        // ~23 tieng truoc gio hen: chi tier "truoc 1 ngay" duoc gui.
        const dayBeforeNow = new Date(appointedAt.getTime() - 23 * 3_600_000);
        const dayBeforeResult =
            await checkAppointmentRemindersAndNoShow(dayBeforeNow);
        expect(dayBeforeResult.remindersSent).toBe(1);

        const reminderNotifs = await Notification.find({
            relatedModel: "Appointment",
            relatedId: created.data._id,
            type: "appointment.reminder",
        });
        expect(reminderNotifs).toHaveLength(1);
        expect(reminderNotifs[0].body).toContain("Dia diem: UBND Phường Test");
        expect(reminderNotifs[0].body).toContain("CMND/CCCD ban chinh");

        // Goi lai cung thoi diem: khong gui trung tier "truoc 1 ngay".
        const repeatResult =
            await checkAppointmentRemindersAndNoShow(dayBeforeNow);
        expect(repeatResult.remindersSent).toBe(0);

        // ~1 tieng truoc gio hen: tier "truoc 2 tieng" duoc gui rieng.
        const nearNow = new Date(appointedAt.getTime() - 1 * 3_600_000);
        const nearResult = await checkAppointmentRemindersAndNoShow(nearNow);
        expect(nearResult.remindersSent).toBe(1);

        const allReminderNotifs = await Notification.find({
            relatedModel: "Appointment",
            relatedId: created.data._id,
            type: "appointment.reminder",
        });
        expect(allReminderNotifs).toHaveLength(2);
    });
});

describe("GET /api/appointments/:id/audit-logs", () => {
    it("tra ve lich su xu ly cua lich hen (19.7.14)", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const house = await createHouse();
        const { service, slotId } = await createService();

        const created = await readJson(
            await createAppointmentRoute(
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
            ),
        );

        const res = await auditLogsRoute(
            makeRequest(`/api/appointments/${created.data._id}/audit-logs`, {
                headers,
            }),
            { params: { id: created.data._id } },
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(
            json.data.items.some((log: any) => log.action === "appointment.create"),
        ).toBe(true);
    });
});
