import {
    AppointmentHoliday,
    type IAppointmentHoliday,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import type {
    CreateAppointmentHolidayInput,
    UpdateAppointmentHolidayInput,
} from "@/validators/appointmentHoliday";

/**
 * Chuyen "YYYY-MM-DD" thanh Date UTC 00:00:00 - cung quy uoc voi
 * appointmentService.parseDateOnly (khong export nen viet lai o day) de dam
 * bao so sanh dung voi Appointment.appointedDate khi kiem tra ngay nghi.
 */
function parseDateOnly(dateStr: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) throw new HttpError("Ngay khong hop le (YYYY-MM-DD)", 422);
    const [, y, m, d] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/**
 * Xac dinh wardCode hieu luc cho mot ngay nghi: nhan vien/lanh dao phuong (co
 * san actorUser.wardCode) luon bi ghi de bang wardCode cua chinh ho (khong
 * duoc khai bao ngay nghi cho phuong khac); admin he thong (khong co wardCode
 * rieng) duoc dung input.wardCode - bo trong nghia la ap dung TOAN BO cac
 * phuong/xa. Cung quy uoc voi appointmentServiceService.resolveNeighborhoodWard
 * (khong tin wardCode client gui len khi actor da co wardCode rieng).
 */
function resolveWardCode(
    actorUser: IUser,
    inputWardCode?: number,
): number | undefined {
    return actorUser.wardCode ?? inputWardCode;
}

export async function listAppointmentHolidays(params: {
    actorUser: IUser;
    from?: string;
    to?: string;
}) {
    const filter: Record<string, unknown> = {};
    // Nhan vien/lanh dao phuong chi thay ngay nghi ap dung cho phuong minh
    // (rieng cua phuong HOAC ap dung toan he thong); admin he thong thay tat
    // ca (khong loc theo wardCode).
    if (params.actorUser.wardCode !== undefined) {
        filter.$or = [
            { wardCode: { $exists: false } },
            { wardCode: params.actorUser.wardCode },
        ];
    }
    if (params.from || params.to) {
        const range: Record<string, unknown> = {};
        if (params.from) range.$gte = parseDateOnly(params.from);
        if (params.to) range.$lte = parseDateOnly(params.to);
        filter.date = range;
    }
    return AppointmentHoliday.find(filter).sort({ date: 1 });
}

/**
 * Tra ve ngay nghi (neu co) ap dung cho mot phuong/xa cu the tai mot ngay -
 * khop ngay nghi TOAN HE THONG (wardCode khong dat) HOAC ngay nghi rieng cua
 * dung wardCode do. Dung boi appointmentService.ts de chan dat/doi lich.
 */
export async function findHolidayForWard(
    wardCode: number | undefined,
    date: Date,
): Promise<IAppointmentHoliday | null> {
    const orClauses: Record<string, unknown>[] = [{ wardCode: { $exists: false } }];
    if (wardCode !== undefined) orClauses.push({ wardCode });
    return AppointmentHoliday.findOne({ date, $or: orClauses });
}

export async function createAppointmentHoliday(
    actorUser: IUser,
    input: CreateAppointmentHolidayInput,
): Promise<IAppointmentHoliday> {
    const date = parseDateOnly(input.date);
    const wardCode = resolveWardCode(actorUser, input.wardCode);

    const duplicate = await AppointmentHoliday.findOne({ date, wardCode });
    if (duplicate) {
        throw new HttpError("Ngay nay da duoc khai bao la ngay nghi/le", 409);
    }

    const holiday = await AppointmentHoliday.create({
        date,
        name: input.name,
        type: input.type,
        wardCode,
        note: input.note,
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment_holiday.create",
        targetModel: "AppointmentHoliday",
        targetId: holiday._id,
        metadata: { date: input.date, name: input.name },
    });

    return holiday;
}

export async function updateAppointmentHoliday(
    actorUser: IUser,
    id: string,
    input: UpdateAppointmentHolidayInput,
): Promise<IAppointmentHoliday> {
    const holiday = await AppointmentHoliday.findById(id);
    if (!holiday) throw new HttpError("Khong tim thay ngay nghi/le", 404);

    const nextDate = input.date ? parseDateOnly(input.date) : holiday.date;
    const nextWardCode =
        input.wardCode !== undefined
            ? resolveWardCode(actorUser, input.wardCode)
            : holiday.wardCode;

    if (
        (input.date || input.wardCode !== undefined) &&
        !(nextDate.getTime() === holiday.date.getTime() &&
            nextWardCode === holiday.wardCode)
    ) {
        const duplicate = await AppointmentHoliday.findOne({
            _id: { $ne: holiday._id },
            date: nextDate,
            wardCode: nextWardCode,
        });
        if (duplicate) {
            throw new HttpError("Ngay nay da duoc khai bao la ngay nghi/le", 409);
        }
    }

    if (input.date) holiday.date = nextDate;
    if (input.wardCode !== undefined) holiday.wardCode = nextWardCode;
    if (input.name !== undefined) holiday.name = input.name;
    if (input.type !== undefined) holiday.type = input.type;
    if (input.note !== undefined) holiday.note = input.note;
    holiday.updatedBy = actorUser._id as any;
    await holiday.save();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment_holiday.update",
        targetModel: "AppointmentHoliday",
        targetId: holiday._id,
        metadata: { date: input.date, name: input.name },
    });

    return holiday;
}

export async function deleteAppointmentHoliday(
    actorUser: IUser,
    id: string,
): Promise<null> {
    const holiday = await AppointmentHoliday.findById(id);
    if (!holiday) throw new HttpError("Khong tim thay ngay nghi/le", 404);

    await holiday.deleteOne();

    await writeAuditLog({
        actorId: actorUser._id,
        action: "appointment_holiday.delete",
        targetModel: "AppointmentHoliday",
        targetId: id,
        metadata: { date: holiday.date.toISOString().slice(0, 10), name: holiday.name },
    });

    return null;
}
