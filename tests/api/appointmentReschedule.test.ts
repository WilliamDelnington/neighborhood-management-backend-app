import { describe, it, expect } from "vitest";
import {
    POST as createAppointmentRoute,
} from "@/app/api/appointments/route";
import {
    POST as rescheduleAppointmentRoute,
} from "@/app/api/appointments/[id]/reschedule/route";
import {
    Appointment,
    AppointmentService,
    AppointmentSlotCounter,
    HouseRecord,
} from "@/models";
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

// Mirror chinh xac appointmentService.parseDateOnly (UTC midnight) - can dung
// dung format nay khi truy van truc tiep AppointmentSlotCounter.appointedDate,
// vi Mongo so sanh Date bang gia tri chinh xac (ke ca gio/phut/giay).
function parseDateOnly(dateStr: string): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

// +7/+14 ngay tu hom nay luon cung mot THU trong tuan, nen chi can MOT khung
// gio (mot dayOfWeek) la du de test ca lich hen goc lan lich hen doi sang -
// tranh phai dinh nghia du 7 khung gio cho tung thu.
const originalDateStr = toDateOnlyString(addDays(new Date(), 7));
const rescheduleDateStr = toDateOnlyString(addDays(new Date(), 14));
const originalDate = parseDateOnly(originalDateStr);
const rescheduleDate = parseDateOnly(rescheduleDateStr);
const slotDayOfWeek = isoDayOfWeek(originalDate);

async function createService(
    overrides: { autoApprove?: boolean; maxCapacity?: number } = {},
) {
    const service = await AppointmentService.create({
        key: `svc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: "Dich vu test",
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
                maxCapacity: overrides.maxCapacity ?? 1,
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

describe("POST /api/appointments/:id/reschedule", () => {
    it("cong dan doi lich hen 'da_xac_nhan' sang ngay/khung gio khac thanh cong, giai phong slot cu va dat slot moi", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, slotId } = await createService({ autoApprove: true });
        const house = await createHouse();

        const created = await readJson(
            await createAppointmentRoute(
                makeRequest("/api/appointments", {
                    method: "POST",
                    headers,
                    body: {
                        serviceId: String(service._id),
                        houseId: String(house._id),
                        timeSlotId: slotId,
                        appointedDate: toDateOnlyString(originalDate),
                    },
                }),
            ),
        );
        expect(created.data.status).toBe("da_xac_nhan");
        const appointmentId = created.data._id;

        const res = await rescheduleAppointmentRoute(
            makeRequest(`/api/appointments/${appointmentId}/reschedule`, {
                method: "POST",
                headers,
                body: {
                    timeSlotId: slotId,
                    appointedDate: toDateOnlyString(rescheduleDate),
                    reason: "Bận đột xuất, xin đổi sang tuần sau",
                },
            }),
            { params: { id: appointmentId } },
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.status).toBe("da_xac_nhan");
        expect(json.data.appointedDate.slice(0, 10)).toBe(
            toDateOnlyString(rescheduleDate),
        );
        expect(json.data.rescheduleReason).toBe(
            "Bận đột xuất, xin đổi sang tuần sau",
        );
        expect(json.data.rescheduledFromDate.slice(0, 10)).toBe(
            toDateOnlyString(originalDate),
        );

        const oldCounter = await AppointmentSlotCounter.findOne({
            serviceId: service._id,
            timeSlotId: slotId,
            appointedDate: originalDate,
        });
        expect(oldCounter?.bookedCount ?? 0).toBe(0);

        const newCounter = await AppointmentSlotCounter.findOne({
            serviceId: service._id,
            timeSlotId: slotId,
            appointedDate: rescheduleDate,
        });
        expect(newCounter?.bookedCount).toBe(1);
    });

    it("tu choi doi lich neu lich hen dang khong o trang thai 'da_xac_nhan'", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, slotId } = await createService({ autoApprove: false });
        const house = await createHouse();

        const created = await readJson(
            await createAppointmentRoute(
                makeRequest("/api/appointments", {
                    method: "POST",
                    headers,
                    body: {
                        serviceId: String(service._id),
                        houseId: String(house._id),
                        timeSlotId: slotId,
                        appointedDate: toDateOnlyString(originalDate),
                    },
                }),
            ),
        );
        expect(created.data.status).toBe("cho_xac_nhan");

        const res = await rescheduleAppointmentRoute(
            makeRequest(`/api/appointments/${created.data._id}/reschedule`, {
                method: "POST",
                headers,
                body: {
                    timeSlotId: slotId,
                    appointedDate: toDateOnlyString(rescheduleDate),
                    reason: "Doi lich",
                },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(409);
    });

    it("tu choi doi lich neu nguoi goi khong phai chu lich hen (khac ca cancelAppointment - khong cho phep admin/officer doi thay)", async () => {
        const owner = await createTestUser({ roles: ["admin"] });
        const stranger = await createTestUser({ roles: ["admin"] });
        const ownerHeaders = await authHeaders(owner);
        const strangerHeaders = await authHeaders(stranger);
        const { service, slotId } = await createService({ autoApprove: true });
        const house = await createHouse();

        const created = await readJson(
            await createAppointmentRoute(
                makeRequest("/api/appointments", {
                    method: "POST",
                    headers: ownerHeaders,
                    body: {
                        serviceId: String(service._id),
                        houseId: String(house._id),
                        timeSlotId: slotId,
                        appointedDate: toDateOnlyString(originalDate),
                    },
                }),
            ),
        );

        const res = await rescheduleAppointmentRoute(
            makeRequest(`/api/appointments/${created.data._id}/reschedule`, {
                method: "POST",
                headers: strangerHeaders,
                body: {
                    timeSlotId: slotId,
                    appointedDate: toDateOnlyString(rescheduleDate),
                    reason: "Doi lich ho",
                },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(403);
    });

    it("bat buoc phai nhap ly do doi lich", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, slotId } = await createService({ autoApprove: true });
        const house = await createHouse();

        const created = await readJson(
            await createAppointmentRoute(
                makeRequest("/api/appointments", {
                    method: "POST",
                    headers,
                    body: {
                        serviceId: String(service._id),
                        houseId: String(house._id),
                        timeSlotId: slotId,
                        appointedDate: toDateOnlyString(originalDate),
                    },
                }),
            ),
        );

        const res = await rescheduleAppointmentRoute(
            makeRequest(`/api/appointments/${created.data._id}/reschedule`, {
                method: "POST",
                headers,
                body: {
                    timeSlotId: slotId,
                    appointedDate: toDateOnlyString(rescheduleDate),
                    reason: "   ",
                },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(422);
    });

    it("tu choi doi lich neu khung gio moi da het cho, khong dong gi den slot cu", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, slotId } = await createService({
            autoApprove: true,
            maxCapacity: 1,
        });
        const houseA = await createHouse();
        const houseB = await createHouse();

        const appointmentA = await readJson(
            await createAppointmentRoute(
                makeRequest("/api/appointments", {
                    method: "POST",
                    headers,
                    body: {
                        serviceId: String(service._id),
                        houseId: String(houseA._id),
                        timeSlotId: slotId,
                        appointedDate: toDateOnlyString(originalDate),
                    },
                }),
            ),
        );
        // Lap day duy nhat 1 cho o rescheduleDate bang mot lich hen khac (nha B).
        await createAppointmentRoute(
            makeRequest("/api/appointments", {
                method: "POST",
                headers,
                body: {
                    serviceId: String(service._id),
                    houseId: String(houseB._id),
                    timeSlotId: slotId,
                    appointedDate: toDateOnlyString(rescheduleDate),
                },
            }),
        );

        const res = await rescheduleAppointmentRoute(
            makeRequest(
                `/api/appointments/${appointmentA.data._id}/reschedule`,
                {
                    method: "POST",
                    headers,
                    body: {
                        timeSlotId: slotId,
                        appointedDate: toDateOnlyString(rescheduleDate),
                        reason: "Doi lich",
                    },
                },
            ),
            { params: { id: appointmentA.data._id } },
        );
        expect(res.status).toBe(409);

        // Slot cu (nha A, originalDate) van con nguyen, chua bi giai phong.
        const oldCounter = await AppointmentSlotCounter.findOne({
            serviceId: service._id,
            timeSlotId: slotId,
            appointedDate: originalDate,
        });
        expect(oldCounter?.bookedCount).toBe(1);
    });

    it("tu choi doi lich neu lich hen hien tai da qua gan gio hen (< 2 tieng), giong BR-03 cua huy lich", async () => {
        const admin = await createTestUser({ roles: ["admin"] });
        const headers = await authHeaders(admin);
        const { service, slotId } = await createService({ autoApprove: true });
        const house = await createHouse();

        const created = await readJson(
            await createAppointmentRoute(
                makeRequest("/api/appointments", {
                    method: "POST",
                    headers,
                    body: {
                        serviceId: String(service._id),
                        houseId: String(house._id),
                        timeSlotId: slotId,
                        appointedDate: originalDateStr,
                    },
                }),
            ),
        );

        // BR-01 chan dat lich cung ngay qua API, nen gia lap lich hen "sap
        // toi gio" (con 30 phut) bang cach cap nhat truc tiep appointedDate/
        // startTime cua ban ghi vua tao.
        const soon = new Date(Date.now() + 30 * 60_000);
        await Appointment.updateOne(
            { _id: created.data._id },
            {
                appointedDate: parseDateOnly(toDateOnlyString(soon)),
                startTime: `${String(soon.getUTCHours()).padStart(2, "0")}:${String(
                    soon.getUTCMinutes(),
                ).padStart(2, "0")}`,
            },
        );

        const res = await rescheduleAppointmentRoute(
            makeRequest(`/api/appointments/${created.data._id}/reschedule`, {
                method: "POST",
                headers,
                body: {
                    timeSlotId: slotId,
                    appointedDate: rescheduleDateStr,
                    reason: "Doi lich gap",
                },
            }),
            { params: { id: created.data._id } },
        );
        expect(res.status).toBe(409);
    });
});
