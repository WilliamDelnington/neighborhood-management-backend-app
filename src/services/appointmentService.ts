import {
    Appointment,
    AppointmentService,
    AppointmentSlotCounter,
    HouseRecord,
    Household,
    User,
    type IAppointment,
    type IAppointmentService,
    type IHouseRecord,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { generateYearlyCode } from "@/lib/utils";
import { createNotification } from "@/services/notificationService";
import { writeAuditLog } from "@/services/auditService";
import { areaScopeFilter, wardScopeFilter } from "@/lib/rbac";
import { isHouseOwnerActor } from "@/services/houseOwnershipService";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { findHolidayForWard } from "@/services/appointmentHolidayService";
import type {
    CreateAppointmentInput,
    RateAppointmentInput,
    RescheduleAppointmentInput,
} from "@/validators/appointment";

// ---------------------------------------------------------------------------
// Hang so nghiep vu (BR-01..BR-04, xem ke hoach)
// ---------------------------------------------------------------------------
const MIN_BOOKING_DAYS_AHEAD = 1; // T+1
const MAX_BOOKING_DAYS_AHEAD = 30; // T+30
// BR-03 - ap dung cho ca huy (cancelAppointment) va doi lich (rescheduleAppointment):
// cong dan/nguoi dat tu thao tac chi duoc lam truoc gio hen it nhat tung nay
// tieng; can bo duoc phan cong dich vu (hoac admin) khong bi rang buoc nay khi
// huy (rescheduleAppointment khong cho officer/admin doi thay nen khong can
// nhanh bypass tuong tu).
const SELF_SERVICE_MIN_HOURS_BEFORE = 2;
const NO_SHOW_GRACE_MINUTES = 15;
const NO_SHOW_LOCK_THRESHOLD = 3; // BR-04
const NO_SHOW_LOOKBACK_DAYS = 30;
const NO_SHOW_LOCK_DAYS = 14;
const REMINDER_LEAD_HOURS = 2;
const DAY_BEFORE_REMINDER_LEAD_HOURS = 24;

// Chi hai vai tro nay duoc dat lich HO cu dan (proxy - khong tai khoan, hoac
// chi dinh mot citizenUserId khac ban than) - xem quyet dinh da chot trong ke
// hoach ("Proxy booking").
const PROXY_ELIGIBLE_ROLES = ["neighborhood_leader", "neighborhood_coleader"];

const ACTIVE_APPOINTMENT_STATUSES = ["cho_xac_nhan", "da_xac_nhan"];
// BR-05 (Chong spam): mot cong dan (citizenUserId) khong duoc co qua tung nay
// lich hen CHUA HOAN THANH cung luc - rong hon ACTIVE_APPOINTMENT_STATUSES vi
// tinh ca lich da check-in nhung chua hoan thanh (van dang "treo").
const MAX_UNFINISHED_APPOINTMENTS_PER_CITIZEN = 3;
const UNFINISHED_APPOINTMENT_STATUSES = [
    "cho_xac_nhan",
    "da_xac_nhan",
    "da_check_in",
];

/**
 * Chuyen "YYYY-MM-DD" thanh Date UTC 00:00:00 - dung thong nhat cho
 * Appointment.appointedDate/AppointmentSlotCounter.appointedDate, tranh lech
 * mui gio server khi so sanh/dem theo ngay.
 */
function parseDateOnly(dateStr: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) throw new HttpError("Ngày không hợp lệ (YYYY-MM-DD)", 422);
    const [, y, m, d] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/** Thu trong tuan theo quy uoc ISO 8601 (1=Thu Hai...7=Chu Nhat). */
function toIsoDayOfWeek(date: Date): number {
    const jsDay = date.getUTCDay();
    return jsDay === 0 ? 7 : jsDay;
}

/** Ghep Date (chi lay phan ngay) voi gio "HH:mm" thanh mot thoi diem cu the. */
function combineDateAndTime(date: Date, time: string): Date {
    const [hh, mm] = time.split(":").map(Number);
    const combined = new Date(date);
    combined.setUTCHours(hh, mm, 0, 0);
    return combined;
}

/**
 * Noi dung thong bao dung chung cho "dat thanh cong" (19.17.1) va ca hai tier
 * nhac lich (19.17.2/19.17.3) - luon kem dia diem (19.17.5) va ho so can
 * chuan bi neu dich vu co khai bao (19.17.4). Khong co khai niem QR/ma rieng
 * (19.17.6) trong he thong nay - dung lai ma lich hen (code) nhu ma tra cuu.
 */
function buildAppointmentMessage(
    service: { name: string; locationAddress: string; description?: string },
    code: string,
    startTime: string,
    dateStr: string,
): string {
    const parts = [
        `Ma ${code}: ${service.name} luc ${startTime} ngay ${dateStr}`,
        `Dia diem: ${service.locationAddress}`,
    ];
    if (service.description) {
        parts.push(`Ho so can chuan bi: ${service.description}`);
    }
    return parts.join(". ");
}

/**
 * Tra ve chuoi id cua mot truong tham chieu, du dang ObjectId "tho" hay da
 * duoc .populate() thanh document con - cung tien ich voi refIdToString trong
 * houseRecordService.ts (khong export nen viet lai ban rut gon o day).
 */
function refIdToString(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
        return String((value as { _id: unknown })._id);
    }
    return String(value);
}

/** Tra ve cho da dat (bookedCount:-1) khi huy/tu choi/vang mat - co dieu kien
 * bookedCount > 0 de khong bao gio am. */
async function releaseSlotCounter(appointment: IAppointment): Promise<void> {
    await AppointmentSlotCounter.updateOne(
        {
            serviceId: appointment.serviceId,
            timeSlotId: appointment.timeSlotId,
            appointedDate: appointment.appointedDate,
            bookedCount: { $gt: 0 },
        },
        { $inc: { bookedCount: -1 } },
    );
}

/**
 * Giai phong TRUC TIEP theo (serviceId, timeSlotId, appointedDate) truyen vao,
 * khac releaseSlotCounter(appointment) doc truc tiep tu appointment - can dung
 * ban nay trong rescheduleAppointment vi sau khi appointment.save() ghi de
 * timeSlotId/appointedDate sang gia tri MOI, khong the doc lai gia tri CU tu
 * chinh appointment nua.
 */
async function releaseSlotCounterByKey(
    serviceId: unknown,
    timeSlotId: unknown,
    appointedDate: Date,
): Promise<void> {
    await AppointmentSlotCounter.updateOne(
        { serviceId, timeSlotId, appointedDate, bookedCount: { $gt: 0 } },
        { $inc: { bookedCount: -1 } },
    );
}

/**
 * Dat cho nguyen tu cho mot (serviceId, timeSlotId, appointedDate) - xem co
 * che tai AppointmentSlotCounter.ts. Dung chung boi createAppointment va
 * rescheduleAppointment; nem HttpError(409) neu het cho.
 */
async function reserveSlotCounter(
    serviceId: unknown,
    timeSlotId: unknown,
    appointedDate: Date,
    maxCapacity: number,
): Promise<void> {
    await AppointmentSlotCounter.findOneAndUpdate(
        { serviceId, timeSlotId, appointedDate },
        { $setOnInsert: { bookedCount: 0 } },
        { upsert: true },
    );
    const reserved = await AppointmentSlotCounter.findOneAndUpdate(
        { serviceId, timeSlotId, appointedDate, bookedCount: { $lt: maxCapacity } },
        { $inc: { bookedCount: 1 } },
        { new: true },
    );
    if (!reserved) {
        throw new HttpError(
            "Khung gio nay da het cho, vui long chon khung gio khac",
            409,
        );
    }
}

/**
 * Nem HttpError(403) neu actor khong duoc phep check-in/hoan-thanh/xac-nhan/tu-choi
 * lich hen cua dich vu nay - phai la admin HOAC nam trong
 * AppointmentService.assignedOfficerUserIds CUA CHINH DICH VU DO (khac blanket
 * role check "bat ky ai co appointments.checkin" - xem quyet dinh da chot
 * trong ke hoach).
 */
function isOfficerForService(
    actorUser: IUser,
    service: IAppointmentService,
): boolean {
    if (actorUser.roles.includes("admin")) return true;
    const officerIds = service.assignedOfficerUserIds.map(id => String(id));
    return officerIds.includes(String(actorUser._id));
}

function assertOfficerForService(
    actorUser: IUser,
    service: IAppointmentService,
): void {
    if (!isOfficerForService(actorUser, service)) {
        throw new HttpError(
            "Bạn không được phân công phụ trách dịch vụ này",
            403,
        );
    }
}

/**
 * Nem HttpError(403) neu actor khong duoc truy cap tai lieu dinh kem cua lich
 * hen nay - dung boi cac route /api/appointments/:id/attachments*. Cho phep:
 * chu lich hen (citizenUserId/bookedByUserId), can bo duoc phan cong dich vu
 * nay, hoac admin - KHONG dung pham vi ward/neighborhood chung (khac
 * assertAppointmentInScope) vi tai lieu dinh kem la thong tin nhay cam hon,
 * chi nguoi thuc su lien quan truc tiep moi duoc xem.
 */
export async function assertAppointmentAttachmentAccess(
    actorUser: IUser,
    appointment: IAppointment,
): Promise<void> {
    if (actorUser.roles.includes("admin")) return;
    const isOwner =
        refIdToString(appointment.citizenUserId) === String(actorUser._id) ||
        refIdToString(appointment.bookedByUserId) === String(actorUser._id);
    if (isOwner) return;

    const service = await AppointmentService.findById(appointment.serviceId).select(
        "assignedOfficerUserIds",
    );
    if (service && isOfficerForService(actorUser, service)) return;

    throw new HttpError(
        "Bạn không có quyền truy cập tài liệu đính kèm của lịch hẹn này",
        403,
    );
}

/**
 * Dieu kien Mongo loc lich hen theo pham vi phu trach - to truong/to pho theo
 * to dan pho duoc gan (areaScopeFilter), cac vai tro cap phuong/xa khac
 * (bi thu, can bo UBND, cong an khu vuc) theo wardCode (wardScopeFilter tren
 * truong neighborhoodId cua Appointment, denormalized tu AppointmentService).
 */
async function appointmentScopeFilter(
    actorUser: IUser,
): Promise<Record<string, unknown>> {
    if (actorUser.roles.includes("admin")) return {};
    if (
        actorUser.roles.includes("neighborhood_leader") ||
        actorUser.roles.includes("neighborhood_coleader")
    ) {
        return await areaScopeFilter(actorUser);
    }
    return wardScopeFilter(actorUser, "neighborhoodId");
}

/**
 * Nem HttpError(403) neu actor (nhan vien, dang xem lich hen KHONG phai cua
 * chinh minh dat) ngoai pham vi phu trach - dung boi getAppointmentDetailForRequester.
 */
export function assertAppointmentInScope(actorUser: IUser, appointment: IAppointment): void {
    if (actorUser.roles.includes("admin")) return;
    if (
        actorUser.roles.includes("neighborhood_leader") ||
        actorUser.roles.includes("neighborhood_coleader")
    ) {
        const ids = [actorUser.neighborhoodId, ...(actorUser.assignedNeighborhoodIds || [])]
            .filter(Boolean)
            .map(String);
        const appointmentNeighborhoodId = refIdToString(appointment.neighborhoodId);
        if (!appointmentNeighborhoodId || !ids.includes(appointmentNeighborhoodId)) {
            throw new HttpError(
                "Bạn không có quyền xem lịch hẹn này (ngoài phạm vi phụ trách)",
                403,
            );
        }
        return;
    }
    if (!actorUser.wardCode || appointment.wardCode !== actorUser.wardCode) {
        throw new HttpError(
            "Bạn không có quyền xem lịch hẹn này (ngoài phạm vi phụ trách)",
            403,
        );
    }
}

const APPOINTMENT_POPULATE = [
    { path: "serviceId", select: "name" },
    { path: "houseId", select: "code address" },
    { path: "citizenUserId", select: "displayName phone" },
    { path: "bookedByUserId", select: "displayName" },
    { path: "officerUserId", select: "displayName" },
];

export async function getAppointmentById(id: string): Promise<IAppointment> {
    const appointment = await Appointment.findById(id).populate(
        APPOINTMENT_POPULATE,
    );
    if (!appointment) throw new HttpError("Không tìm thấy lịch hẹn", 404);
    return appointment;
}

export interface AppointmentReadRequester {
    userId: string;
    isStaff: boolean;
    actorUser?: IUser;
}

/**
 * Tra ve chi tiet lich hen neu requester duoc phep xem - chu lich hen (nguoi
 * dat/citizenUserId) luon duoc xem; nhan vien phai co appointments.read
 * (isStaff) va trong pham vi phu trach (assertAppointmentInScope) neu khong
 * phai chinh lich hen ho dat.
 */
export async function getAppointmentDetailForRequester(
    id: string,
    requester: AppointmentReadRequester,
): Promise<IAppointment> {
    const appointment = await getAppointmentById(id);
    const isOwner =
        refIdToString(appointment.citizenUserId) === requester.userId ||
        refIdToString(appointment.bookedByUserId) === requester.userId;
    if (!requester.isStaff && !isOwner) {
        throw new HttpError("Bạn không có quyền xem lịch hẹn này", 403);
    }
    if (requester.isStaff && !isOwner && requester.actorUser) {
        assertAppointmentInScope(requester.actorUser, appointment);
    }
    return appointment;
}

export async function getAppointmentByCode(code: string): Promise<IAppointment> {
    const appointment = await Appointment.findOne({ code });
    if (!appointment) {
        throw new HttpError("Không tìm thấy lịch hẹn với mã này", 404);
    }
    return getAppointmentById(String(appointment._id));
}

/**
 * GET /api/appointments/available-slots - voi moi khung gio active cua dich
 * vu khop THU trong tuan cua ngay duoc chon, tra ve so cho da dat (doc tu
 * AppointmentSlotCounter, mac dinh 0 neu chua co ai dat) va con cho hay khong.
 */
export async function getAvailableSlots(serviceId: string, dateStr: string) {
    const service = await AppointmentService.findById(serviceId);
    if (!service) throw new HttpError("Không tìm thấy dịch vụ đặt lịch hẹn", 404);
    if (!service.active) {
        throw new HttpError("Dịch vụ này đã ngừng hoạt động", 400);
    }

    const date = parseDateOnly(dateStr);
    // 19.2.8/19.2.9: ngay nghi/le/tam ngung tiep nhan - khong co khung gio nao
    // duoc mo, giong het truong hop khong cau hinh khung gio cho THU nay (tra
    // ve rong, KHONG throw loi - tranh doi hoi 2 man dat/doi lich phai xu ly
    // rieng mot loai loi khac biet cho truong hop nay).
    const holiday = await findHolidayForWard(service.wardCode, date);
    if (holiday) return [];

    const isoDayOfWeek = toIsoDayOfWeek(date);
    const activeSlots = service.timeSlots.filter(
        slot => slot.active && slot.dayOfWeek === isoDayOfWeek,
    );
    if (activeSlots.length === 0) return [];

    const counters = await AppointmentSlotCounter.find({
        serviceId: service._id,
        timeSlotId: { $in: activeSlots.map(slot => slot._id) },
        appointedDate: date,
    });
    const countBySlotId = new Map(
        counters.map(counter => [String(counter.timeSlotId), counter.bookedCount]),
    );

    return activeSlots
        .slice()
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map(slot => {
            const bookedCount = countBySlotId.get(String(slot._id)) || 0;
            return {
                slot_id: String(slot._id),
                start_time: slot.startTime,
                end_time: slot.endTime,
                max_capacity: slot.maxCapacity,
                booked_count: bookedCount,
                is_available: bookedCount < slot.maxCapacity,
            };
        });
}

/**
 * BR-01: xac dinh actor co du quyen dat lich cho houseId+citizenUserId nay hay
 * khong, va tra ve citizenUserId/proxy thuc su se ghi vao Appointment. Trang
 * thai/pham vi cua nha (verified/in_scope) da duoc kiem tra RIENG o
 * createAppointment theo AppointmentService.houseStatusRequirement truoc khi
 * goi ham nay - o day chi con lai cau hoi actor co quyen gan voi house nay
 * hay khong (bo qua neu house=null, tuc dich vu khong gan nha).
 * - Neu co proxyName+proxyPhone (khong kem citizenUserId): CHI
 *   neighborhood_leader/coleader (hoac admin) moi duoc dat, va nha (neu co)
 *   phai trong pham vi phu trach cua actor (assertHouseRecordInScope).
 * - Neu dat cho CHINH MINH (khong truyen citizenUserId, hoac citizenUserId
 *   trung actor): actor phai dang so huu/thao tac thay chu nha (isHouseOwnerActor)
 *   HOAC la chu ho (household_head) cua ho dan gan dung nha nay - household_head
 *   khong co HouseOwnership rieng nen khong the dung isHouseOwnerActor, phai
 *   doi chieu qua Household.houseId. Bo qua neu house=null.
 * - Neu dat cho MOT NGUOI KHAC co tai khoan (citizenUserId khac actor, khong
 *   kem proxy): cung yeu cau vai tro to truong/to pho (hoac admin) + nha (neu
 *   co) trong pham vi phu trach, tuong tu nhanh proxy.
 */
async function resolveBookingSubject(
    actorUser: IUser,
    house: IHouseRecord | null,
    input: CreateAppointmentInput,
): Promise<{ citizenUserId?: string; proxyName?: string; proxyPhone?: string }> {
    const isActorProxyEligible =
        actorUser.roles.includes("admin") ||
        PROXY_ELIGIBLE_ROLES.some(role => actorUser.roles.includes(role));
    const isProxyBooking = Boolean(input.proxyName && input.proxyPhone);

    if (isProxyBooking) {
        if (!isActorProxyEligible) {
            throw new HttpError(
                "Chỉ tổ trưởng/tổ phó mới được đặt lịch hộ cư dân không có tài khoản",
                403,
            );
        }
        if (house) await assertHouseRecordInScope(actorUser, house);
        return { proxyName: input.proxyName, proxyPhone: input.proxyPhone };
    }

    const citizenUserId = input.citizenUserId || String(actorUser._id);
    const isSelf = citizenUserId === String(actorUser._id);

    if (isSelf) {
        if (house) {
            const isOwner = await isHouseOwnerActor(house._id, actorUser._id);
            let isHouseholdHead = false;
            if (!isOwner && actorUser.householdId) {
                const household = await Household.findById(
                    actorUser.householdId,
                ).select("houseId");
                isHouseholdHead =
                    !!household?.houseId &&
                    String(household.houseId) === String(house._id);
            }
            if (!isOwner && !isHouseholdHead && !actorUser.roles.includes("admin")) {
                throw new HttpError(
                    "Bạn không sở hữu/không đại diện hộ dân tại nhà số này",
                    403,
                );
            }
        }
        return { citizenUserId };
    }

    if (!isActorProxyEligible) {
        throw new HttpError("Bạn không có quyền đặt lịch hộ người khác", 403);
    }
    if (house) await assertHouseRecordInScope(actorUser, house);
    const citizen = await User.findById(citizenUserId).select("status");
    if (!citizen || citizen.status !== "active") {
        throw new HttpError("Tài khoản người dân được chọn không hợp lệ", 422);
    }
    return { citizenUserId };
}

export async function createAppointment(
    actorUser: IUser,
    input: CreateAppointmentInput,
): Promise<IAppointment> {
    const service = await AppointmentService.findById(input.serviceId);
    if (!service) throw new HttpError("Không tìm thấy dịch vụ đặt lịch hẹn", 404);
    if (!service.active) throw new HttpError("Dịch vụ này đã ngừng hoạt động", 400);

    // Doc lai voi fallback vi cac AppointmentService tao truoc khi co hai
    // truong nay se khong co gia tri (mongoose default chi ap dung luc tao
    // moi, khong "vá" lai cho doc cu doc tu DB).
    const houseRequirement = service.houseRequirement || "required";
    const houseStatusRequirement = service.houseStatusRequirement || "verified";

    let house: IHouseRecord | null = null;
    if (input.houseId) {
        house = await HouseRecord.findById(input.houseId);
        if (!house) throw new HttpError("Không tìm thấy nhà số", 404);
    } else if (houseRequirement === "required") {
        throw new HttpError("Thiếu nhà số", 422);
    }

    if (house && !actorUser.roles.includes("admin")) {
        if (houseStatusRequirement === "verified" && house.status !== "verified") {
            throw new HttpError(
                "Nhà số chưa được xác thực, chưa thể đặt lịch hẹn",
                422,
            );
        }
        if (houseStatusRequirement === "in_scope") {
            const inScope =
                service.scope === "neighborhood"
                    ? String(house.neighborhoodId || "") ===
                      String(service.neighborhoodId || "")
                    : house.wardCode === service.wardCode;
            if (!inScope) {
                throw new HttpError(
                    "Nhà số không thuộc phạm vi áp dụng của dịch vụ này",
                    422,
                );
            }
        }
    }

    const subject = await resolveBookingSubject(actorUser, house, input);

    // BR-04: tai khoan dang bi tam khoa dat lich do vang mat nhieu lan - chi
    // ap dung khi TU dat cho chinh minh (khong chan to truong/to pho dat ho
    // nguoi khac vi le khoa gan voi citizenUserId, khong phai actor).
    if (
        subject.citizenUserId &&
        subject.citizenUserId === String(actorUser._id) &&
        actorUser.appointmentBookingLockedUntil &&
        actorUser.appointmentBookingLockedUntil.getTime() > Date.now()
    ) {
        throw new HttpError(
            `Tài khoản của bạn đang bị tạm khóa đặt lịch hẹn do vắng mặt nhiều lần, đến ${actorUser.appointmentBookingLockedUntil.toLocaleDateString("vi-VN")}`,
            403,
        );
    }

    // BR-05: chan dat them neu cong dan nay da co >= 3 lich hen chua hoan
    // thanh (o bat ky dich vu/ngay nao) - chi ap dung khi biet ro citizenUserId
    // (bo qua proxy booking cho nguoi khong co tai khoan, vi khong co dinh
    // danh on dinh de dem).
    if (subject.citizenUserId) {
        const unfinishedCount = await Appointment.countDocuments({
            citizenUserId: subject.citizenUserId,
            status: { $in: UNFINISHED_APPOINTMENT_STATUSES },
        });
        if (unfinishedCount >= MAX_UNFINISHED_APPOINTMENTS_PER_CITIZEN) {
            throw new HttpError(
                `Cong dan nay da co ${unfinishedCount} lich hen chua hoan thanh, khong the dat them (toi da ${MAX_UNFINISHED_APPOINTMENTS_PER_CITIZEN})`,
                409,
            );
        }
    }

    // Ngay hen phai trong khoang [T+1, T+30].
    const appointedDate = parseDateOnly(input.appointedDate);
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const diffDays = Math.round(
        (appointedDate.getTime() - today.getTime()) / 86_400_000,
    );
    if (diffDays < MIN_BOOKING_DAYS_AHEAD || diffDays > MAX_BOOKING_DAYS_AHEAD) {
        throw new HttpError(
            `Chỉ được đặt lịch hẹn từ ${MIN_BOOKING_DAYS_AHEAD} đến ${MAX_BOOKING_DAYS_AHEAD} ngày kể từ hôm nay`,
            422,
        );
    }

    // 19.2.8/19.2.9: khong cho dat lich vao ngay nghi/le/tam ngung tiep nhan -
    // getAvailableSlots da tra ve rong cho ngay nay nen client binh thuong
    // khong the chon duoc, day la lop chan phong thu (vd client dung du lieu
    // cu, hoac ngay nghi moi duoc khai bao sau khi client da tai danh sach).
    const holiday = await findHolidayForWard(service.wardCode, appointedDate);
    if (holiday) {
        throw new HttpError(
            `Ngay ${input.appointedDate} la ngay nghi/le (${holiday.name}), khong the dat lich hen`,
            422,
        );
    }

    const slot = service.timeSlots.find(s => String(s._id) === input.timeSlotId);
    if (!slot || !slot.active) throw new HttpError("Khung giờ không hợp lệ", 422);
    if (slot.dayOfWeek !== toIsoDayOfWeek(appointedDate)) {
        throw new HttpError("Khung giờ không áp dụng cho ngày đã chọn", 422);
    }

    // BR-02: khong cho dat trung (cung nha + dich vu + khung gio + ngay) khi
    // con mot lich hen dang hieu luc (cho_xac_nhan/da_xac_nhan). Khi dich vu
    // khong gan nha, doi chieu theo citizenUserId thay the (bo qua neu ca hai
    // deu khong co, vd proxy booking khong nha - khong the phat hien trung).
    const duplicateFilter: Record<string, unknown> = {
        serviceId: service._id,
        timeSlotId: slot._id,
        appointedDate,
        status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    };
    if (house) {
        duplicateFilter.houseId = house._id;
    } else if (subject.citizenUserId) {
        duplicateFilter.citizenUserId = subject.citizenUserId;
    }
    const duplicate =
        house || subject.citizenUserId
            ? await Appointment.findOne(duplicateFilter)
            : null;
    if (duplicate) {
        throw new HttpError(
            "Nhà số này đã có lịch hẹn cho khung giờ/ngày này, không thể đặt trùng",
            409,
        );
    }

    // Dat cho nguyen tu (xem AppointmentSlotCounter.ts).
    await reserveSlotCounter(service._id, slot._id, appointedDate, slot.maxCapacity);

    let appointment: IAppointment;
    try {
        const code = await generateYearlyCode(Appointment, "HB-LH");
        appointment = await Appointment.create({
            _id: input.draftId,
            code,
            serviceId: service._id,
            timeSlotId: slot._id,
            houseId: house?._id,
            citizenUserId: subject.citizenUserId,
            proxyName: subject.proxyName,
            proxyPhone: subject.proxyPhone,
            bookedByUserId: actorUser._id,
            appointedDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            note: input.note,
            status: service.autoApprove ? "da_xac_nhan" : "cho_xac_nhan",
            wardCode: service.wardCode,
            neighborhoodId: service.neighborhoodId,
            createdBy: actorUser._id,
        });
    } catch (err) {
        // Tao that bai sau khi da dat cho - tra lai cho ngay, tranh "ro ri"
        // suat da dat ma khong co lich hen nao thuc su ton tai.
        await releaseSlotCounterByKey(service._id, slot._id, appointedDate);
        throw err;
    }

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment.create",
        targetModel: "Appointment",
        targetId: appointment._id,
        metadata: {
            code: appointment.code,
            serviceId: String(service._id),
            status: appointment.status,
        },
    });

    const createdBody = buildAppointmentMessage(
        service,
        appointment.code,
        slot.startTime,
        input.appointedDate,
    );
    const notifyUserIds = new Set<string>();
    if (subject.citizenUserId) notifyUserIds.add(subject.citizenUserId);
    notifyUserIds.add(String(actorUser._id));
    await createNotification({
        title: service.autoApprove
            ? "Dat lich hen thanh cong"
            : "Dat lich hen thanh cong, dang cho xac nhan",
        body: createdBody,
        type: "appointment.created",
        targetUserIds: [...notifyUserIds],
        relatedModel: "Appointment",
        relatedId: appointment._id,
        createdBy: actorUser._id,
    });
    if (service.assignedOfficerUserIds.length) {
        await createNotification({
            title: "Co lich hen moi can xu ly",
            body: createdBody,
            type: "appointment.created",
            targetUserIds: service.assignedOfficerUserIds,
            relatedModel: "Appointment",
            relatedId: appointment._id,
            createdBy: actorUser._id,
        });
    }

    return getAppointmentById(String(appointment._id));
}

export async function listAppointments(params: {
    actorUser: IUser;
    status?: string;
    serviceId?: string;
    date?: string;
    page: number;
    limit: number;
}) {
    const clauses: Record<string, unknown>[] = [];
    if (params.status) clauses.push({ status: params.status });
    if (params.serviceId) clauses.push({ serviceId: params.serviceId });
    if (params.date) clauses.push({ appointedDate: parseDateOnly(params.date) });

    const scope = await appointmentScopeFilter(params.actorUser);
    if (Object.keys(scope).length > 0) clauses.push(scope);

    const filter: Record<string, unknown> = clauses.length ? { $and: clauses } : {};

    const [items, total] = await Promise.all([
        Appointment.find(filter)
            .sort({ appointedDate: -1, startTime: 1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate(APPOINTMENT_POPULATE),
        Appointment.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function listMyAppointments(
    actorUser: IUser,
    params: { status?: string; page: number; limit: number },
) {
    const clauses: Record<string, unknown>[] = [
        {
            $or: [
                { bookedByUserId: actorUser._id },
                { citizenUserId: actorUser._id },
            ],
        },
    ];
    if (params.status) clauses.push({ status: params.status });
    const filter = { $and: clauses };

    const [items, total] = await Promise.all([
        Appointment.find(filter)
            .sort({ appointedDate: -1, startTime: 1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate(APPOINTMENT_POPULATE),
        Appointment.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

/**
 * BR-03: cong dan (chu lich hen/nguoi dat) chi duoc huy truoc gio hen it nhat
 * SELF_SERVICE_MIN_HOURS_BEFORE tieng; can bo duoc phan cong dich vu (hoac
 * admin) duoc huy bat ky luc nao.
 */
export async function cancelAppointment(
    actorUser: IUser,
    id: string,
    reason: string,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Không tìm thấy lịch hẹn", 404);
    if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status)) {
        throw new HttpError("Lịch hẹn này không thể hủy ở trạng thái hiện tại", 409);
    }

    const service = await AppointmentService.findById(appointment.serviceId);
    const isOfficerOrAdmin =
        actorUser.roles.includes("admin") ||
        (!!service &&
            service.assignedOfficerUserIds.some(
                officerId => String(officerId) === String(actorUser._id),
            ));

    if (!isOfficerOrAdmin) {
        const isCitizenOrBooker =
            refIdToString(appointment.citizenUserId) === String(actorUser._id) ||
            refIdToString(appointment.bookedByUserId) === String(actorUser._id);
        if (!isCitizenOrBooker) {
            throw new HttpError("Bạn không có quyền hủy lịch hẹn này", 403);
        }
        const appointedAt = combineDateAndTime(
            appointment.appointedDate,
            appointment.startTime,
        );
        const hoursUntil = (appointedAt.getTime() - Date.now()) / 3_600_000;
        if (hoursUntil < SELF_SERVICE_MIN_HOURS_BEFORE) {
            throw new HttpError(
                `Chỉ được hủy lịch hẹn trước giờ hẹn ít nhất ${SELF_SERVICE_MIN_HOURS_BEFORE} tiếng`,
                409,
            );
        }
    }

    appointment.status = "da_huy";
    appointment.cancelReason = reason;
    await appointment.save();
    await releaseSlotCounter(appointment);

    const notifyIds = [appointment.citizenUserId, appointment.bookedByUserId]
        .filter(Boolean)
        .map(String);
    if (notifyIds.length) {
        await createNotification({
            title: "Lich hen da bi huy",
            body: `Lich hen ${appointment.code} da bi huy${reason ? `: ${reason}` : ""}`,
            type: "appointment.cancelled",
            targetUserIds: [...new Set(notifyIds)],
            relatedModel: "Appointment",
            relatedId: appointment._id,
            createdBy: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment.cancel",
        targetModel: "Appointment",
        targetId: appointment._id,
        metadata: { reason },
    });

    return getAppointmentById(String(appointment._id));
}

/**
 * Cong dan/nguoi dat doi lich hen sang ngay/khung gio khac - CHI duoc phep khi
 * lich hen dang "da_xac_nhan" (khac cancelAppointment, khong ap dung cho
 * "cho_xac_nhan" hay cac trang thai khac), va bat buoc phai co ly do. Ap dung
 * lai dung nguong BR-03 cua huy lich (SELF_SERVICE_MIN_HOURS_BEFORE tieng
 * truoc gio hen) - chi cong dan/nguoi dat moi duoc doi (khong cho phep
 * officer/admin doi thay qua endpoint nay, khac voi cancelAppointment nen
 * khong can nhanh bypass rieng cho ho).
 *
 * Giu nguyen _id/code cua lich hen (khong tao lich hen moi) - dat cho o slot
 * MOI truoc (that bai neu het cho, chua dong gi den slot cu), roi moi giai
 * phong slot CU sau khi luu thanh cong; neu buoc luu that bai, hoan tac lai
 * cho vua dat o slot moi. Ghi lai ngay/gio CU + ly do ngay tren Appointment
 * (chi ban ghi GAN NHAT) va mot audit log "appointment.reschedule" (lich su
 * day du, bat bien qua tung lan doi).
 */
export async function rescheduleAppointment(
    actorUser: IUser,
    id: string,
    input: RescheduleAppointmentInput,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);

    const isCitizenOrBooker =
        refIdToString(appointment.citizenUserId) === String(actorUser._id) ||
        refIdToString(appointment.bookedByUserId) === String(actorUser._id);
    if (!isCitizenOrBooker) {
        throw new HttpError("Ban khong co quyen doi lich hen nay", 403);
    }
    if (appointment.status !== "da_xac_nhan") {
        throw new HttpError(
            "Chi doi duoc lich hen dang o trang thai da xac nhan",
            409,
        );
    }
    const currentAppointedAt = combineDateAndTime(
        appointment.appointedDate,
        appointment.startTime,
    );
    const hoursUntilCurrent =
        (currentAppointedAt.getTime() - Date.now()) / 3_600_000;
    if (hoursUntilCurrent < SELF_SERVICE_MIN_HOURS_BEFORE) {
        throw new HttpError(
            `Chi duoc doi lich hen truoc gio hen it nhat ${SELF_SERVICE_MIN_HOURS_BEFORE} tieng`,
            409,
        );
    }

    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);
    if (!service.active) throw new HttpError("Dich vu nay da ngung hoat dong", 400);

    // Ngay hen moi phai trong khoang [T+1, T+30], giong BR-01 luc dat lich.
    const newAppointedDate = parseDateOnly(input.appointedDate);
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const diffDays = Math.round(
        (newAppointedDate.getTime() - today.getTime()) / 86_400_000,
    );
    if (diffDays < MIN_BOOKING_DAYS_AHEAD || diffDays > MAX_BOOKING_DAYS_AHEAD) {
        throw new HttpError(
            `Chi duoc doi sang ngay tu ${MIN_BOOKING_DAYS_AHEAD} den ${MAX_BOOKING_DAYS_AHEAD} ngay ke tu hom nay`,
            422,
        );
    }

    // 19.2.8/19.2.9: khong cho doi sang ngay nghi/le/tam ngung tiep nhan -
    // cung ly do voi createAppointment (lop chan phong thu, binh thuong client
    // khong the chon duoc ngay nay vi getAvailableSlots da tra ve rong).
    const newDateHoliday = await findHolidayForWard(
        service.wardCode,
        newAppointedDate,
    );
    if (newDateHoliday) {
        throw new HttpError(
            `Ngay ${input.appointedDate} la ngay nghi/le (${newDateHoliday.name}), khong the doi lich sang ngay nay`,
            422,
        );
    }

    const newSlot = service.timeSlots.find(
        s => String(s._id) === input.timeSlotId,
    );
    if (!newSlot || !newSlot.active) throw new HttpError("Khung gio khong hop le", 422);
    if (newSlot.dayOfWeek !== toIsoDayOfWeek(newAppointedDate)) {
        throw new HttpError("Khung gio khong ap dung cho ngay da chon", 422);
    }
    if (
        String(newSlot._id) === String(appointment.timeSlotId) &&
        newAppointedDate.getTime() === appointment.appointedDate.getTime()
    ) {
        throw new HttpError(
            "Vui long chon ngay hoac khung gio khac voi lich hen hien tai",
            422,
        );
    }

    // BR-02: khong doi sang mot khung gio da co lich hen khac (cung nha) dang
    // hieu luc - loai tru chinh lich hen dang doi.
    const rescheduleDuplicateFilter: Record<string, unknown> = {
        _id: { $ne: appointment._id },
        serviceId: service._id,
        timeSlotId: newSlot._id,
        appointedDate: newAppointedDate,
        status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    };
    if (appointment.houseId) {
        rescheduleDuplicateFilter.houseId = appointment.houseId;
    } else if (appointment.citizenUserId) {
        rescheduleDuplicateFilter.citizenUserId = appointment.citizenUserId;
    }
    const duplicate =
        appointment.houseId || appointment.citizenUserId
            ? await Appointment.findOne(rescheduleDuplicateFilter)
            : null;
    if (duplicate) {
        throw new HttpError(
            "Nha so nay da co lich hen cho khung gio/ngay nay, khong the doi trung",
            409,
        );
    }

    await reserveSlotCounter(
        service._id,
        newSlot._id,
        newAppointedDate,
        newSlot.maxCapacity,
    );

    const previous = {
        serviceId: appointment.serviceId,
        timeSlotId: appointment.timeSlotId,
        date: appointment.appointedDate,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
    };

    try {
        appointment.rescheduledFromDate = previous.date;
        appointment.rescheduledFromStartTime = previous.startTime;
        appointment.rescheduledFromEndTime = previous.endTime;
        appointment.rescheduleReason = input.reason;
        appointment.rescheduledAt = new Date();
        appointment.timeSlotId = newSlot._id;
        appointment.appointedDate = newAppointedDate;
        appointment.startTime = newSlot.startTime;
        appointment.endTime = newSlot.endTime;
        // Xoa dau nhac gan voi khung gio CU - de scheduler nhac lai dung theo
        // gio hen MOI (xem checkAppointmentRemindersAndNoShow).
        appointment.reminderSentAt = undefined;
        appointment.dayBeforeReminderSentAt = undefined;
        await appointment.save();
    } catch (err) {
        // Luu that bai sau khi da dat cho o slot MOI - tra lai cho ngay (slot
        // CU chua bi dong den nen khong can hoan tac o do).
        await releaseSlotCounterByKey(service._id, newSlot._id, newAppointedDate);
        throw err;
    }

    // Chi giai phong slot CU SAU KHI luu thanh cong, dung gia tri da luu lai
    // o `previous` (appointment.timeSlotId/appointedDate luc nay da la gia tri
    // MOI nen khong the dung releaseSlotCounter(appointment) nhu cac cho khac).
    await releaseSlotCounterByKey(
        previous.serviceId,
        previous.timeSlotId,
        previous.date,
    );

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment.reschedule",
        targetModel: "Appointment",
        targetId: appointment._id,
        metadata: {
            reason: input.reason,
            fromDate: previous.date.toISOString().slice(0, 10),
            fromStartTime: previous.startTime,
            fromEndTime: previous.endTime,
            toDate: input.appointedDate,
            toStartTime: newSlot.startTime,
            toEndTime: newSlot.endTime,
        },
    });

    const bodyText =
        `Lich hen ${appointment.code} da duoc doi sang luc ${newSlot.startTime} ` +
        `ngay ${input.appointedDate} (truoc do: ${previous.startTime} ngay ` +
        `${previous.date.toISOString().slice(0, 10)}). Ly do: ${input.reason}`;

    const notifyIds = [appointment.citizenUserId, appointment.bookedByUserId]
        .filter(Boolean)
        .map(String);
    if (notifyIds.length) {
        await createNotification({
            title: "Lich hen da duoc doi lich",
            body: bodyText,
            type: "appointment.rescheduled",
            targetUserIds: [...new Set(notifyIds)],
            relatedModel: "Appointment",
            relatedId: appointment._id,
            createdBy: actorUser._id,
        });
    }
    // "Nguoi phu trach" (nguoi duoc thong bao voi vai tro appointer) - uu tien
    // chinh officer da xac nhan lich hen nay (officerUserId); neu chua co (vd
    // dich vu autoApprove, chua ai xac nhan thu cong), bao cho toan bo can bo
    // duoc phan cong dich vu, giong nhanh thong bao luc tao moi lich hen.
    const officerNotifyIds = appointment.officerUserId
        ? [String(appointment.officerUserId)]
        : service.assignedOfficerUserIds.map(String);
    if (officerNotifyIds.length) {
        await createNotification({
            title: "Lich hen da duoc cong dan doi lich",
            body: bodyText,
            type: "appointment.rescheduled",
            targetUserIds: officerNotifyIds,
            relatedModel: "Appointment",
            relatedId: appointment._id,
            createdBy: actorUser._id,
        });
    }

    return getAppointmentById(String(appointment._id));
}

/** Chi co y nghia khi dich vu autoApprove=false - officer cua dich vu duyet
 * mot lich hen dang "cho_xac_nhan". */
export async function confirmAppointment(
    actorUser: IUser,
    id: string,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Không tìm thấy lịch hẹn", 404);
    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Không tìm thấy dịch vụ đặt lịch hẹn", 404);
    assertOfficerForService(actorUser, service);
    if (appointment.status !== "cho_xac_nhan") {
        throw new HttpError("Chỉ xác nhận được lịch hẹn đang chờ xác nhận", 409);
    }

    appointment.status = "da_xac_nhan";
    appointment.officerUserId = actorUser._id as any;
    await appointment.save();

    const notifyIds = [appointment.citizenUserId, appointment.bookedByUserId]
        .filter(Boolean)
        .map(String);
    if (notifyIds.length) {
        await createNotification({
            title: "Lich hen da duoc xac nhan",
            body: `Lich hen ${appointment.code} da duoc xac nhan`,
            type: "appointment.confirmed",
            targetUserIds: [...new Set(notifyIds)],
            relatedModel: "Appointment",
            relatedId: appointment._id,
            createdBy: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment.confirm",
        targetModel: "Appointment",
        targetId: appointment._id,
    });

    return getAppointmentById(String(appointment._id));
}

export async function rejectAppointment(
    actorUser: IUser,
    id: string,
    reason: string,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Không tìm thấy lịch hẹn", 404);
    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Không tìm thấy dịch vụ đặt lịch hẹn", 404);
    assertOfficerForService(actorUser, service);
    if (appointment.status !== "cho_xac_nhan") {
        throw new HttpError("Chỉ từ chối được lịch hẹn đang chờ xác nhận", 409);
    }

    appointment.status = "tu_choi";
    appointment.rejectReason = reason;
    appointment.officerUserId = actorUser._id as any;
    await appointment.save();
    await releaseSlotCounter(appointment);

    const notifyIds = [appointment.citizenUserId, appointment.bookedByUserId]
        .filter(Boolean)
        .map(String);
    if (notifyIds.length) {
        await createNotification({
            title: "Lich hen bi tu choi",
            body: `Lich hen ${appointment.code} bi tu choi: ${reason}. Ban co the dat lai lich hen moi cho dich vu "${service.name}".`,
            type: "appointment.rejected",
            targetUserIds: [...new Set(notifyIds)],
            relatedModel: "Appointment",
            relatedId: appointment._id,
            createdBy: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment.reject",
        targetModel: "Appointment",
        targetId: appointment._id,
        metadata: { reason },
    });

    return getAppointmentById(String(appointment._id));
}

export async function checkInAppointment(
    actorUser: IUser,
    id: string,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Không tìm thấy lịch hẹn", 404);
    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Không tìm thấy dịch vụ đặt lịch hẹn", 404);
    assertOfficerForService(actorUser, service);
    if (appointment.status !== "da_xac_nhan") {
        throw new HttpError("Chỉ check-in được lịch hẹn đã xác nhận", 409);
    }

    appointment.status = "da_check_in";
    appointment.checkinTime = new Date();
    appointment.officerUserId = actorUser._id as any;
    await appointment.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment.check_in",
        targetModel: "Appointment",
        targetId: appointment._id,
    });

    return getAppointmentById(String(appointment._id));
}

export async function completeAppointment(
    actorUser: IUser,
    id: string,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Không tìm thấy lịch hẹn", 404);
    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Không tìm thấy dịch vụ đặt lịch hẹn", 404);
    assertOfficerForService(actorUser, service);
    if (appointment.status !== "da_check_in") {
        throw new HttpError("Chỉ hoàn thành được lịch hẹn đã check-in", 409);
    }

    appointment.status = "hoan_thanh";
    appointment.completedTime = new Date();
    await appointment.save();

    const notifyIds = [appointment.citizenUserId, appointment.bookedByUserId]
        .filter(Boolean)
        .map(String);
    if (notifyIds.length) {
        await createNotification({
            title: "Lich hen da hoan thanh",
            body: `Lich hen ${appointment.code} da hoan thanh, moi ban danh gia trai nghiem`,
            type: "appointment.completed",
            targetUserIds: [...new Set(notifyIds)],
            relatedModel: "Appointment",
            relatedId: appointment._id,
            createdBy: actorUser._id,
        });
    }

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment.complete",
        targetModel: "Appointment",
        targetId: appointment._id,
    });

    return getAppointmentById(String(appointment._id));
}

/**
 * Danh gia sau khi hoan thanh - CHI nguoi dat lich (citizenUserId hoac
 * bookedByUserId), CHI mot lan, CHI tu trang thai "hoan_thanh" - mirror dung
 * bat bien cua confirmComplaintResolution (Complaint.rating).
 */
export async function rateAppointment(
    actorUser: IUser,
    id: string,
    input: RateAppointmentInput,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Không tìm thấy lịch hẹn", 404);

    const isCitizenOrBooker =
        refIdToString(appointment.citizenUserId) === String(actorUser._id) ||
        refIdToString(appointment.bookedByUserId) === String(actorUser._id);
    if (!isCitizenOrBooker) {
        throw new HttpError("Chỉ người đặt lịch hẹn này mới được đánh giá", 403);
    }
    if (appointment.status !== "hoan_thanh") {
        throw new HttpError("Chỉ đánh giá được lịch hẹn đã hoàn thành", 400);
    }
    if (appointment.rating !== undefined && appointment.rating !== null) {
        throw new HttpError("Lịch hẹn này đã được đánh giá trước đó", 400);
    }

    appointment.rating = input.rating;
    if (input.ratingNote !== undefined) appointment.ratingNote = input.ratingNote;
    await appointment.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment.rate",
        targetModel: "Appointment",
        targetId: appointment._id,
        metadata: { rating: input.rating },
    });

    return getAppointmentById(String(appointment._id));
}

export type AppointmentServiceReportRow = {
    serviceId: string;
    serviceName: string;
    total: number;
    completed: number;
    noShow: number;
    cancelled: number;
    onTimeRate: number;
    avgRating: number | null;
};

/**
 * Bao cao ty le dung gio (onTimeRate) va danh gia trung binh theo dich vu.
 * Contract khong dinh nghia chinh xac "onTimeRate" - dien giai hop ly nhat la
 * TY LE DEN DUNG HEN trong so cac lich hen DA DIEN RA (hoan_thanh + vang_mat),
 * khong tinh cac lich con dang cho/da huy (chua/khong con dien ra nen khong
 * phan anh "dung gio hay khong").
 */
export async function getAppointmentReportSummary(params: {
    actorUser: IUser;
    serviceId?: string;
    from?: string;
    to?: string;
}) {
    const clauses: Record<string, unknown>[] = [];
    if (params.serviceId) clauses.push({ serviceId: params.serviceId });
    if (params.from || params.to) {
        const range: Record<string, unknown> = {};
        if (params.from) range.$gte = parseDateOnly(params.from);
        if (params.to) range.$lte = parseDateOnly(params.to);
        clauses.push({ appointedDate: range });
    }
    const scope = await appointmentScopeFilter(params.actorUser);
    if (Object.keys(scope).length > 0) clauses.push(scope);
    const filter: Record<string, unknown> = clauses.length ? { $and: clauses } : {};

    const rows = await Appointment.find(filter).select("serviceId status rating");
    const services = await AppointmentService.find(
        params.serviceId ? { _id: params.serviceId } : {},
    ).select("name");
    const serviceNameById = new Map(services.map(s => [String(s._id), s.name]));

    type Bucket = {
        total: number;
        completed: number;
        noShow: number;
        cancelled: number;
        ratingSum: number;
        ratingCount: number;
    };
    const emptyBucket = (): Bucket => ({
        total: 0,
        completed: 0,
        noShow: 0,
        cancelled: 0,
        ratingSum: 0,
        ratingCount: 0,
    });
    const byServiceMap = new Map<string, Bucket>();
    const overall = emptyBucket();

    for (const row of rows) {
        const serviceId = String(row.serviceId);
        if (!byServiceMap.has(serviceId)) byServiceMap.set(serviceId, emptyBucket());
        const bucket = byServiceMap.get(serviceId)!;

        for (const target of [bucket, overall]) {
            target.total += 1;
            if (row.status === "hoan_thanh") target.completed += 1;
            if (row.status === "vang_mat") target.noShow += 1;
            if (row.status === "da_huy" || row.status === "tu_choi") target.cancelled += 1;
            if (row.rating !== undefined && row.rating !== null) {
                target.ratingSum += row.rating;
                target.ratingCount += 1;
            }
        }
    }

    function toSummary(bucket: Bucket, serviceId?: string): AppointmentServiceReportRow | {
        total: number;
        completed: number;
        noShow: number;
        cancelled: number;
        onTimeRate: number;
        avgRating: number | null;
    } {
        const attendedDenominator = bucket.completed + bucket.noShow;
        const onTimeRate =
            attendedDenominator > 0 ? bucket.completed / attendedDenominator : 0;
        const avgRating =
            bucket.ratingCount > 0 ? bucket.ratingSum / bucket.ratingCount : null;
        if (serviceId === undefined) {
            return {
                total: bucket.total,
                completed: bucket.completed,
                noShow: bucket.noShow,
                cancelled: bucket.cancelled,
                onTimeRate,
                avgRating,
            };
        }
        return {
            serviceId,
            serviceName: serviceNameById.get(serviceId) || serviceId,
            total: bucket.total,
            completed: bucket.completed,
            noShow: bucket.noShow,
            cancelled: bucket.cancelled,
            onTimeRate,
            avgRating,
        };
    }

    const byService = [...byServiceMap.entries()].map(([serviceId, bucket]) =>
        toSummary(bucket, serviceId),
    ) as AppointmentServiceReportRow[];

    return {
        byService,
        overall: toSummary(overall) as {
            total: number;
            completed: number;
            noShow: number;
            cancelled: number;
            onTimeRate: number;
            avgRating: number | null;
        },
    };
}

export type AppointmentReminderNoShowResult = {
    remindersSent: number;
    noShowMarked: number;
    lockedUsers: number;
};

/**
 * Job dinh ky (xem startAppointmentScheduler trong lib/scheduler.ts):
 * (a) nhac lich hen "da_xac_nhan" sap toi, hai tier doc lap: <=
 *     DAY_BEFORE_REMINDER_LEAD_HOURS (~1 ngay, dayBeforeReminderSentAt) va <=
 *     REMINDER_LEAD_HOURS (~2 tieng, reminderSentAt) - moi tier chi gui MOT
 *     LAN nho co dau rieng, ca hai co the cung ton tai tren mot lich hen.
 * (b) lich hen "da_xac_nhan" da qua gio hen + NO_SHOW_GRACE_MINUTES ma chua
 *     check-in - chuyen "vang_mat", tra lai cho, ghi audit log; neu cong dan
 *     do co >= NO_SHOW_LOCK_THRESHOLD lan vang mat trong NO_SHOW_LOOKBACK_DAYS
 *     ngay gan nhat (BR-04) - tam khoa dat lich NO_SHOW_LOCK_DAYS ngay (khong
 *     rut ngan mot khoa dang co hieu luc lau hon).
 * Nhan tham so `now` tuy chon de kiem thu truc tiep (goi ham voi timestamp tuy
 * chinh) thay vi phai cho dong ho that - xem ghi chu kiem thu trong ke hoach.
 */
export async function checkAppointmentRemindersAndNoShow(
    now: Date = new Date(),
): Promise<AppointmentReminderNoShowResult> {
    let remindersSent = 0;
    let noShowMarked = 0;
    let lockedUsers = 0;

    const upcoming = await Appointment.find({
        status: "da_xac_nhan",
        $or: [
            { reminderSentAt: { $exists: false } },
            { dayBeforeReminderSentAt: { $exists: false } },
        ],
    });
    // Fetch tat ca dich vu lien quan MOT LAN (thay vi truy van rieng tung
    // lich hen trong vong lap) de lay locationAddress/description dua vao noi
    // dung nhac lich (19.17.4/19.17.5) - xem buildAppointmentMessage.
    const serviceIds = [...new Set(upcoming.map(a => String(a.serviceId)))];
    const services = await AppointmentService.find({
        _id: { $in: serviceIds },
    }).select("name locationAddress description");
    const serviceById = new Map(services.map(s => [String(s._id), s]));

    for (const appointment of upcoming) {
        const service = serviceById.get(String(appointment.serviceId));
        if (!service) continue;
        const appointedAt = combineDateAndTime(
            appointment.appointedDate,
            appointment.startTime,
        );
        const hoursUntil = (appointedAt.getTime() - now.getTime()) / 3_600_000;
        if (hoursUntil <= 0) continue;
        const notifyIds = [appointment.citizenUserId, appointment.bookedByUserId]
            .filter(Boolean)
            .map(String);
        const dateStr = appointment.appointedDate.toISOString().slice(0, 10);
        let dirty = false;

        if (
            !appointment.dayBeforeReminderSentAt &&
            hoursUntil <= DAY_BEFORE_REMINDER_LEAD_HOURS
        ) {
            if (notifyIds.length) {
                await createNotification({
                    title: "Nhac lich hen: con 1 ngay nua",
                    body: buildAppointmentMessage(
                        service,
                        appointment.code,
                        appointment.startTime,
                        dateStr,
                    ),
                    type: "appointment.reminder",
                    targetUserIds: [...new Set(notifyIds)],
                    relatedModel: "Appointment",
                    relatedId: appointment._id,
                });
            }
            appointment.dayBeforeReminderSentAt = now;
            dirty = true;
            remindersSent += 1;
        }

        if (
            !appointment.reminderSentAt &&
            hoursUntil <= REMINDER_LEAD_HOURS
        ) {
            if (notifyIds.length) {
                await createNotification({
                    title: "Nhac lich hen sap toi",
                    body: buildAppointmentMessage(
                        service,
                        appointment.code,
                        appointment.startTime,
                        dateStr,
                    ),
                    type: "appointment.reminder",
                    targetUserIds: [...new Set(notifyIds)],
                    relatedModel: "Appointment",
                    relatedId: appointment._id,
                });
            }
            appointment.reminderSentAt = now;
            dirty = true;
            remindersSent += 1;
        }

        if (dirty) await appointment.save();
    }

    const potentialNoShow = await Appointment.find({ status: "da_xac_nhan" });
    const affectedCitizenIds = new Set<string>();
    for (const appointment of potentialNoShow) {
        const appointedAt = combineDateAndTime(
            appointment.appointedDate,
            appointment.startTime,
        );
        const graceDeadline = new Date(
            appointedAt.getTime() + NO_SHOW_GRACE_MINUTES * 60_000,
        );
        if (now.getTime() >= graceDeadline.getTime()) {
            appointment.status = "vang_mat";
            await appointment.save();
            await releaseSlotCounter(appointment);
            await writeAuditLog({
                action: "appointment.no_show",
                targetModel: "Appointment",
                targetId: appointment._id,
            });
            noShowMarked += 1;
            if (appointment.citizenUserId) {
                affectedCitizenIds.add(String(appointment.citizenUserId));
            }
        }
    }

    for (const citizenId of affectedCitizenIds) {
        const since = new Date(now.getTime() - NO_SHOW_LOOKBACK_DAYS * 86_400_000);
        const noShowCount = await Appointment.countDocuments({
            citizenUserId: citizenId,
            status: "vang_mat",
            updatedAt: { $gte: since },
        });
        if (noShowCount < NO_SHOW_LOCK_THRESHOLD) continue;

        const lockedUntil = new Date(now.getTime() + NO_SHOW_LOCK_DAYS * 86_400_000);
        const citizen = await User.findById(citizenId).select(
            "appointmentBookingLockedUntil",
        );
        if (!citizen) continue;
        if (
            citizen.appointmentBookingLockedUntil &&
            citizen.appointmentBookingLockedUntil.getTime() >= lockedUntil.getTime()
        ) {
            continue;
        }

        await User.updateOne(
            { _id: citizenId },
            { appointmentBookingLockedUntil: lockedUntil },
        );
        await createNotification({
            title: "Tai khoan bi tam khoa dat lich hen",
            body: `Ban da vang mat ${noShowCount} lan trong ${NO_SHOW_LOOKBACK_DAYS} ngay gan day nen bi tam khoa dat lich hen den ${lockedUntil.toLocaleDateString("vi-VN")}`,
            type: "appointment.booking_locked",
            targetUserIds: [citizenId],
            relatedModel: "User",
            relatedId: citizenId,
        });
        lockedUsers += 1;
    }

    return { remindersSent, noShowMarked, lockedUsers };
}
