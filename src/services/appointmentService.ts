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
import type {
    CreateAppointmentInput,
    RateAppointmentInput,
} from "@/validators/appointment";

// ---------------------------------------------------------------------------
// Hang so nghiep vu (BR-01..BR-04, xem ke hoach)
// ---------------------------------------------------------------------------
const MIN_BOOKING_DAYS_AHEAD = 1; // T+1
const MAX_BOOKING_DAYS_AHEAD = 30; // T+30
const CANCEL_MIN_HOURS_BEFORE = 2; // BR-03
const NO_SHOW_GRACE_MINUTES = 15;
const NO_SHOW_LOCK_THRESHOLD = 3; // BR-04
const NO_SHOW_LOOKBACK_DAYS = 30;
const NO_SHOW_LOCK_DAYS = 14;
const REMINDER_LEAD_HOURS = 2;

// Chi hai vai tro nay duoc dat lich HO cu dan (proxy - khong tai khoan, hoac
// chi dinh mot citizenUserId khac ban than) - xem quyet dinh da chot trong ke
// hoach ("Proxy booking").
const PROXY_ELIGIBLE_ROLES = ["neighborhood_leader", "neighborhood_coleader"];

const ACTIVE_APPOINTMENT_STATUSES = ["cho_xac_nhan", "da_xac_nhan"];

/**
 * Chuyen "YYYY-MM-DD" thanh Date UTC 00:00:00 - dung thong nhat cho
 * Appointment.appointedDate/AppointmentSlotCounter.appointedDate, tranh lech
 * mui gio server khi so sanh/dem theo ngay.
 */
function parseDateOnly(dateStr: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) throw new HttpError("Ngay khong hop le (YYYY-MM-DD)", 422);
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
            "Ban khong duoc phan cong phu trach dich vu nay",
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
        "Ban khong co quyen truy cap tai lieu dinh kem cua lich hen nay",
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
        return areaScopeFilter(actorUser);
    }
    return wardScopeFilter(actorUser, "neighborhoodId");
}

/**
 * Nem HttpError(403) neu actor (nhan vien, dang xem lich hen KHONG phai cua
 * chinh minh dat) ngoai pham vi phu trach - dung boi getAppointmentDetailForRequester.
 */
function assertAppointmentInScope(actorUser: IUser, appointment: IAppointment): void {
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
                "Ban khong co quyen xem lich hen nay (ngoai pham vi phu trach)",
                403,
            );
        }
        return;
    }
    if (!actorUser.wardCode || appointment.wardCode !== actorUser.wardCode) {
        throw new HttpError(
            "Ban khong co quyen xem lich hen nay (ngoai pham vi phu trach)",
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
    if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);
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
        throw new HttpError("Ban khong co quyen xem lich hen nay", 403);
    }
    if (requester.isStaff && !isOwner && requester.actorUser) {
        assertAppointmentInScope(requester.actorUser, appointment);
    }
    return appointment;
}

export async function getAppointmentByCode(code: string): Promise<IAppointment> {
    const appointment = await Appointment.findOne({ code });
    if (!appointment) {
        throw new HttpError("Khong tim thay lich hen voi ma nay", 404);
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
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);
    if (!service.active) {
        throw new HttpError("Dich vu nay da ngung hoat dong", 400);
    }

    const date = parseDateOnly(dateStr);
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
 * khong, va tra ve citizenUserId/proxy thuc su se ghi vao Appointment.
 * - Neu co proxyName+proxyPhone (khong kem citizenUserId): CHI
 *   neighborhood_leader/coleader (hoac admin) moi duoc dat, va nha phai trong
 *   pham vi phu trach cua actor (assertHouseRecordInScope).
 * - Neu dat cho CHINH MINH (khong truyen citizenUserId, hoac citizenUserId
 *   trung actor): nha phai "verified" VA actor phai dang so huu/thao tac thay
 *   chu nha (isHouseOwnerActor) HOAC la chu ho (household_head) cua ho dan gan
 *   dung nha nay - household_head khong co HouseOwnership rieng nen khong the
 *   dung isHouseOwnerActor, phai doi chieu qua Household.houseId.
 * - Neu dat cho MOT NGUOI KHAC co tai khoan (citizenUserId khac actor, khong
 *   kem proxy): cung yeu cau vai tro to truong/to pho (hoac admin) + nha trong
 *   pham vi phu trach, tuong tu nhanh proxy.
 */
async function resolveBookingSubject(
    actorUser: IUser,
    house: IHouseRecord,
    input: CreateAppointmentInput,
): Promise<{ citizenUserId?: string; proxyName?: string; proxyPhone?: string }> {
    const isActorProxyEligible =
        actorUser.roles.includes("admin") ||
        PROXY_ELIGIBLE_ROLES.some(role => actorUser.roles.includes(role));
    const isProxyBooking = Boolean(input.proxyName && input.proxyPhone);

    if (isProxyBooking) {
        if (!isActorProxyEligible) {
            throw new HttpError(
                "Chi to truong/to pho moi duoc dat lich ho cu dan khong co tai khoan",
                403,
            );
        }
        await assertHouseRecordInScope(actorUser, house);
        return { proxyName: input.proxyName, proxyPhone: input.proxyPhone };
    }

    const citizenUserId = input.citizenUserId || String(actorUser._id);
    const isSelf = citizenUserId === String(actorUser._id);

    if (isSelf) {
        if (house.status !== "verified" && !actorUser.roles.includes("admin")) {
            throw new HttpError(
                "Nha so chua duoc xac thuc, chua the dat lich hen",
                422,
            );
        }
        const isOwner = await isHouseOwnerActor(house._id, actorUser._id);
        let isHouseholdHead = false;
        if (!isOwner && actorUser.householdId) {
            const household = await Household.findById(actorUser.householdId).select(
                "houseId",
            );
            isHouseholdHead =
                !!household?.houseId && String(household.houseId) === String(house._id);
        }
        if (!isOwner && !isHouseholdHead && !actorUser.roles.includes("admin")) {
            throw new HttpError(
                "Ban khong so huu/khong dai dien ho dan tai nha so nay",
                403,
            );
        }
        return { citizenUserId };
    }

    if (!isActorProxyEligible) {
        throw new HttpError("Ban khong co quyen dat lich ho nguoi khac", 403);
    }
    await assertHouseRecordInScope(actorUser, house);
    const citizen = await User.findById(citizenUserId).select("status");
    if (!citizen || citizen.status !== "active") {
        throw new HttpError("Tai khoan nguoi dan duoc chon khong hop le", 422);
    }
    return { citizenUserId };
}

export async function createAppointment(
    actorUser: IUser,
    input: CreateAppointmentInput,
): Promise<IAppointment> {
    const service = await AppointmentService.findById(input.serviceId);
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);
    if (!service.active) throw new HttpError("Dich vu nay da ngung hoat dong", 400);

    const house = await HouseRecord.findById(input.houseId);
    if (!house) throw new HttpError("Khong tim thay nha so", 404);

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
            `Tai khoan cua ban dang bi tam khoa dat lich hen do vang mat nhieu lan, den ${actorUser.appointmentBookingLockedUntil.toLocaleDateString("vi-VN")}`,
            403,
        );
    }

    // Ngay hen phai trong khoang [T+1, T+30].
    const appointedDate = parseDateOnly(input.appointedDate);
    const today = parseDateOnly(new Date().toISOString().slice(0, 10));
    const diffDays = Math.round(
        (appointedDate.getTime() - today.getTime()) / 86_400_000,
    );
    if (diffDays < MIN_BOOKING_DAYS_AHEAD || diffDays > MAX_BOOKING_DAYS_AHEAD) {
        throw new HttpError(
            `Chi duoc dat lich hen tu ${MIN_BOOKING_DAYS_AHEAD} den ${MAX_BOOKING_DAYS_AHEAD} ngay ke tu hom nay`,
            422,
        );
    }

    const slot = service.timeSlots.find(s => String(s._id) === input.timeSlotId);
    if (!slot || !slot.active) throw new HttpError("Khung gio khong hop le", 422);
    if (slot.dayOfWeek !== toIsoDayOfWeek(appointedDate)) {
        throw new HttpError("Khung gio khong ap dung cho ngay da chon", 422);
    }

    // BR-02: khong cho dat trung (cung nha + dich vu + khung gio + ngay) khi
    // con mot lich hen dang hieu luc (cho_xac_nhan/da_xac_nhan).
    const duplicate = await Appointment.findOne({
        serviceId: service._id,
        timeSlotId: slot._id,
        appointedDate,
        houseId: house._id,
        status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    });
    if (duplicate) {
        throw new HttpError(
            "Nha so nay da co lich hen cho khung gio/ngay nay, khong the dat trung",
            409,
        );
    }

    // Dat cho nguyen tu (xem AppointmentSlotCounter.ts): dam bao doc counter
    // ton tai truoc, roi $inc co dieu kien bookedCount < maxCapacity.
    await AppointmentSlotCounter.findOneAndUpdate(
        { serviceId: service._id, timeSlotId: slot._id, appointedDate },
        { $setOnInsert: { bookedCount: 0 } },
        { upsert: true },
    );
    const reserved = await AppointmentSlotCounter.findOneAndUpdate(
        {
            serviceId: service._id,
            timeSlotId: slot._id,
            appointedDate,
            bookedCount: { $lt: slot.maxCapacity },
        },
        { $inc: { bookedCount: 1 } },
        { new: true },
    );
    if (!reserved) {
        throw new HttpError(
            "Khung gio nay da het cho, vui long chon khung gio khac",
            409,
        );
    }

    let appointment: IAppointment;
    try {
        const code = await generateYearlyCode(Appointment, "HB-LH");
        appointment = await Appointment.create({
            _id: input.draftId,
            code,
            serviceId: service._id,
            timeSlotId: slot._id,
            houseId: house._id,
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
        await AppointmentSlotCounter.updateOne(
            {
                serviceId: service._id,
                timeSlotId: slot._id,
                appointedDate,
                bookedCount: { $gt: 0 },
            },
            { $inc: { bookedCount: -1 } },
        );
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

    const notifyUserIds = new Set<string>();
    if (subject.citizenUserId) notifyUserIds.add(subject.citizenUserId);
    notifyUserIds.add(String(actorUser._id));
    await createNotification({
        title: service.autoApprove
            ? "Dat lich hen thanh cong"
            : "Dat lich hen thanh cong, dang cho xac nhan",
        body: `Ma ${appointment.code}: ${service.name} luc ${slot.startTime} ngay ${input.appointedDate}`,
        type: "appointment.created",
        targetUserIds: [...notifyUserIds],
        relatedModel: "Appointment",
        relatedId: appointment._id,
        createdBy: actorUser._id,
    });
    if (service.assignedOfficerUserIds.length) {
        await createNotification({
            title: "Co lich hen moi can xu ly",
            body: `Ma ${appointment.code}: ${service.name} luc ${slot.startTime} ngay ${input.appointedDate}`,
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
 * CANCEL_MIN_HOURS_BEFORE tieng; can bo duoc phan cong dich vu (hoac admin)
 * duoc huy bat ky luc nao.
 */
export async function cancelAppointment(
    actorUser: IUser,
    id: string,
    reason?: string,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);
    if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status)) {
        throw new HttpError("Lich hen nay khong the huy o trang thai hien tai", 409);
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
            throw new HttpError("Ban khong co quyen huy lich hen nay", 403);
        }
        const appointedAt = combineDateAndTime(
            appointment.appointedDate,
            appointment.startTime,
        );
        const hoursUntil = (appointedAt.getTime() - Date.now()) / 3_600_000;
        if (hoursUntil < CANCEL_MIN_HOURS_BEFORE) {
            throw new HttpError(
                `Chi duoc huy lich hen truoc gio hen it nhat ${CANCEL_MIN_HOURS_BEFORE} tieng`,
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

/** Chi co y nghia khi dich vu autoApprove=false - officer cua dich vu duyet
 * mot lich hen dang "cho_xac_nhan". */
export async function confirmAppointment(
    actorUser: IUser,
    id: string,
): Promise<IAppointment> {
    const appointment = await Appointment.findById(id);
    if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);
    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);
    assertOfficerForService(actorUser, service);
    if (appointment.status !== "cho_xac_nhan") {
        throw new HttpError("Chi xac nhan duoc lich hen dang cho xac nhan", 409);
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
    if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);
    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);
    assertOfficerForService(actorUser, service);
    if (appointment.status !== "cho_xac_nhan") {
        throw new HttpError("Chi tu choi duoc lich hen dang cho xac nhan", 409);
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
            body: `Lich hen ${appointment.code} bi tu choi: ${reason}`,
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
    if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);
    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);
    assertOfficerForService(actorUser, service);
    if (appointment.status !== "da_xac_nhan") {
        throw new HttpError("Chi check-in duoc lich hen da xac nhan", 409);
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
    if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);
    const service = await AppointmentService.findById(appointment.serviceId);
    if (!service) throw new HttpError("Khong tim thay dich vu dat lich hen", 404);
    assertOfficerForService(actorUser, service);
    if (appointment.status !== "da_check_in") {
        throw new HttpError("Chi hoan thanh duoc lich hen da check-in", 409);
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
    if (!appointment) throw new HttpError("Khong tim thay lich hen", 404);

    const isCitizenOrBooker =
        refIdToString(appointment.citizenUserId) === String(actorUser._id) ||
        refIdToString(appointment.bookedByUserId) === String(actorUser._id);
    if (!isCitizenOrBooker) {
        throw new HttpError("Chi nguoi dat lich hen nay moi duoc danh gia", 403);
    }
    if (appointment.status !== "hoan_thanh") {
        throw new HttpError("Chi danh gia duoc lich hen da hoan thanh", 400);
    }
    if (appointment.rating !== undefined && appointment.rating !== null) {
        throw new HttpError("Lich hen nay da duoc danh gia truoc do", 400);
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
 * (a) nhac lich hen "da_xac_nhan" sap toi (<= REMINDER_LEAD_HOURS, chua qua
 *     gio hen) chua duoc nhac - gui thong bao + dong dau reminderSentAt.
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
        reminderSentAt: { $exists: false },
    });
    for (const appointment of upcoming) {
        const appointedAt = combineDateAndTime(
            appointment.appointedDate,
            appointment.startTime,
        );
        const hoursUntil = (appointedAt.getTime() - now.getTime()) / 3_600_000;
        if (hoursUntil > 0 && hoursUntil <= REMINDER_LEAD_HOURS) {
            const notifyIds = [appointment.citizenUserId, appointment.bookedByUserId]
                .filter(Boolean)
                .map(String);
            if (notifyIds.length) {
                await createNotification({
                    title: "Nhac lich hen sap toi",
                    body: `Ban co lich hen ${appointment.code} luc ${appointment.startTime} ngay ${appointment.appointedDate.toISOString().slice(0, 10)}`,
                    type: "appointment.reminder",
                    targetUserIds: [...new Set(notifyIds)],
                    relatedModel: "Appointment",
                    relatedId: appointment._id,
                });
            }
            appointment.reminderSentAt = now;
            await appointment.save();
            remindersSent += 1;
        }
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
