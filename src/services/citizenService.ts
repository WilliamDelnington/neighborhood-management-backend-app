import { Citizen, Household, HouseRecord, type ICitizen, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { clusterScopeFilter } from "@/lib/rbac";
import { hashForLookup, normalizeCccd, normalizePhone } from "@/lib/encryption";
import { writeAuditLog } from "@/services/auditService";
import {
    assertHouseholdInScope,
    getOwnedHouseholdIds,
} from "@/services/householdService";
import { assertHouseRecordVerifiedForMembers } from "@/services/houseRecordService";
import type {
    CreateCitizenInput,
    UpdateCitizenInput,
} from "@/validators/citizen";

/**
 * Neu ho dan co gan nha so, nem HttpError(403) khi nha so do chua duoc xac
 * thuc (xem assertHouseRecordVerifiedForMembers) - dung truoc khi them nhan
 * khau moi vao ho dan, hoac chuyen nhan khau sang mot ho dan khac.
 */
async function assertHouseholdHouseVerified(
    actorUser: IUser,
    household: { houseId?: unknown },
): Promise<void> {
    if (!household.houseId) return;
    const houseRecord = await HouseRecord.findById(household.houseId);
    if (!houseRecord) return;
    assertHouseRecordVerifiedForMembers(actorUser, houseRecord);
}

/**
 * Tinh lai memberCount cua mot ho dan dua tren so nhan khau hien co - quet
 * toan bo Citizen cua ho dan (O(n)). CHI dung cho script backfill/sua du lieu
 * sai lech (xem scripts/backfill-household-member-count.ts); KHONG goi tren
 * hot path them/xoa/chuyen nhan khau - dung adjustHouseholdMemberCount (O(1))
 * cho truong hop do, vi du lieu co the lon.
 */
export async function recomputeHouseholdMemberCount(
    householdId: unknown,
): Promise<void> {
    const count = await Citizen.countDocuments({ householdId });
    await Household.findByIdAndUpdate(householdId, { memberCount: count });
}

/**
 * Cong/tru truc tiep 1 vao memberCount cua ho dan ($inc nguyen tu) - dung khi
 * mot Citizen duoc them/xoa/chuyen ho dan, thay vi quet dem lai toan bo (xem
 * recomputeHouseholdMemberCount) de tranh O(n) tren moi thao tac khi du lieu lon.
 */
async function adjustHouseholdMemberCount(
    householdId: unknown,
    delta: 1 | -1,
): Promise<void> {
    await Household.updateOne(
        { _id: householdId },
        { $inc: { memberCount: delta } },
    );
}

export async function createCitizen(
    actorUser: IUser,
    input: CreateCitizenInput,
): Promise<ICitizen> {
    const household = await Household.findById(input.householdId);
    if (!household) throw new HttpError("Khong tim thay ho dan", 404);
    await assertHouseholdInScope(actorUser, household);
    await assertHouseholdHouseVerified(actorUser, household);

    const actorId = String(actorUser._id);
    const citizen = await Citizen.create({
        fullName: input.fullName,
        phone: input.phone,
        cccd: input.cccd,
        birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
        gender: input.gender ?? "nam",
        relationToHead: input.relationToHead,
        householdId: input.householdId,
        residenceType: input.residenceType ?? "thuong_tru",
        isElderly: input.isElderly ?? false,
        isChild: input.isChild ?? false,
        isDisabledOrSupportNeeded: input.isDisabledOrSupportNeeded ?? false,
        isPartyMember: input.isPartyMember ?? false,
        isUnionMember: input.isUnionMember ?? false,
        zaloUserId: input.zaloUserId,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await adjustHouseholdMemberCount(input.householdId, 1);

    await writeAuditLog({
        actorId,
        action: "citizen.create",
        targetModel: "Citizen",
        targetId: citizen._id,
        metadata: { householdId: input.householdId },
    });

    return citizen;
}

export async function listCitizens(params: {
    page: number;
    limit: number;
    search?: string;
    householdId?: string;
    actorUser: IUser;
}) {
    const isAdminUser = params.actorUser.roles.includes("admin");
    const isResidentUser = params.actorUser.roles.includes("resident");
    const filter: Record<string, unknown> = {};

    if (params.householdId) {
        if (!isAdminUser) {
            const household = await Household.findById(params.householdId);
            if (!household) throw new HttpError("Khong tim thay ho dan", 404);
            await assertHouseholdInScope(params.actorUser, household);
        }
        filter.householdId = params.householdId;
    } else if (isResidentUser) {
        // Resident (chu nha) chi duoc xem nhan khau thuoc cac ho dan nam trong
        // nha ma minh so huu - khong duoc roi vao clusterScopeFilter ben duoi
        // (rong voi resident -> se bi hieu nham la xem duoc toan phuong).
        filter.householdId = {
            $in: await getOwnedHouseholdIds(params.actorUser),
        };
    } else if (!isAdminUser) {
        const scope = clusterScopeFilter(params.actorUser);
        if (Object.keys(scope).length > 0) {
            const allowedHouseholds = await Household.find(scope).select("_id");
            filter.householdId = { $in: allowedHouseholds.map(h => h._id) };
        }
    }

    if (params.search) {
        // phone/cccd la ma hoa AES-256-GCM trong DB nen khong the $regex truc
        // tiep - tim exact-match qua cot bam HMAC (phoneHash/cccdHash) thay vi
        // tim theo chuoi con nhu truoc; ten van tim mo (fuzzy) nhu cu.
        const orConditions: Record<string, unknown>[] = [
            { fullName: { $regex: params.search, $options: "i" } },
        ];
        const normalizedPhone = normalizePhone(params.search);
        if (normalizedPhone) {
            orConditions.push({ phoneHash: hashForLookup(normalizedPhone) });
        }
        const normalizedCccd = normalizeCccd(params.search);
        if (normalizedCccd) {
            orConditions.push({ cccdHash: hashForLookup(normalizedCccd) });
        }
        filter.$or = orConditions;
    }

    const [items, total] = await Promise.all([
        Citizen.find(filter)
            .sort({ createdAt: -1 })
            .skip((params.page - 1) * params.limit)
            .limit(params.limit)
            .populate("householdId", "code address cluster"),
        Citizen.countDocuments(filter),
    ]);

    return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
}

export async function getCitizenById(id: string): Promise<ICitizen> {
    const citizen = await Citizen.findById(id).populate(
        "householdId",
        "code address cluster houseId",
    );
    if (!citizen) throw new HttpError("Khong tim thay nhan khau", 404);
    return citizen;
}

export async function updateCitizen(
    actorUser: IUser,
    id: string,
    patch: UpdateCitizenInput,
): Promise<ICitizen> {
    const citizen = await Citizen.findById(id);
    if (!citizen) throw new HttpError("Khong tim thay nhan khau", 404);

    const oldHouseholdId = String(citizen.householdId);
    let newHouseholdId = oldHouseholdId;

    if (patch.householdId && patch.householdId !== oldHouseholdId) {
        const newHousehold = await Household.findById(patch.householdId);
        if (!newHousehold)
            throw new HttpError("Khong tim thay ho dan moi", 404);
        await assertHouseholdInScope(actorUser, newHousehold);
        await assertHouseholdHouseVerified(actorUser, newHousehold);
        newHouseholdId = patch.householdId;
    }

    // Chi gan cac truong thuc su co mat trong patch (partial schema van tra ve
    // day du key voi gia tri undefined cho truong khong duoc gui len).
    const { birthDate, ...rest } = patch;
    for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
            (citizen as unknown as Record<string, unknown>)[key] = value;
        }
    }
    if (birthDate !== undefined) {
        citizen.birthDate = birthDate ? new Date(birthDate) : undefined;
    }
    const actorId = String(actorUser._id);
    citizen.updatedBy = actorId as any;
    await citizen.save();

    if (newHouseholdId !== oldHouseholdId) {
        await adjustHouseholdMemberCount(oldHouseholdId, -1);
        await adjustHouseholdMemberCount(newHouseholdId, 1);
    }

    await writeAuditLog({
        actorId,
        action: "citizen.update",
        targetModel: "Citizen",
        targetId: citizen._id,
        metadata: patch,
    });

    return citizen;
}

export async function deleteCitizen(
    actorId: string,
    id: string,
): Promise<ICitizen> {
    const citizen = await Citizen.findById(id);
    if (!citizen) throw new HttpError("Khong tim thay nhan khau", 404);

    const householdId = citizen.householdId;
    await citizen.deleteOne();
    await adjustHouseholdMemberCount(householdId, -1);

    await writeAuditLog({
        actorId,
        action: "citizen.delete",
        targetModel: "Citizen",
        targetId: id,
        metadata: { householdId },
    });

    return citizen;
}
