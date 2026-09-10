import { Citizen, Household, HouseRecord, type ICitizen, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { clusterScopeFilter } from "@/lib/rbac";
import { hashForLookup, normalizeCccd, normalizePhone } from "@/lib/encryption";
import { writeAuditLog } from "@/services/auditService";
import {
    assertHouseholdInScope,
    getOwnedHouseholdIds,
} from "@/services/householdService";
import { assertHouseRecordAllowsDeclaration } from "@/services/houseRecordService";
import type {
    CreateCitizenInput,
    UpdateCitizenInput,
} from "@/validators/citizen";

/**
 * Neu ho dan co gan nha so, nem HttpError(403) khi nha so do da bi tu choi
 * hoac bi khoa (xem assertHouseRecordAllowsDeclaration) - dung truoc khi them
 * nhan khau moi vao ho dan, hoac chuyen nhan khau sang mot ho dan khac. Van
 * cho them nhan khau ke ca khi nha con "unverified"/"pending", giong dieu
 * kien khai bao Household/Business (xem householdService.createHousehold).
 */
async function assertHouseholdHouseAllowsDeclaration(
    actorUser: IUser,
    household: { houseId?: unknown },
): Promise<void> {
    if (!household.houseId) return;
    const houseRecord = await HouseRecord.findById(household.houseId);
    if (!houseRecord) return;
    assertHouseRecordAllowsDeclaration(actorUser, houseRecord);
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

/**
 * Tinh lai hasDisabledChild/hasDisabledPerson cho MOT ho dan dua tren Citizen
 * hien co. Khac voi memberCount (counter, dung $inc duoc), day la gia tri
 * "co/khong" nen phai kiem tra lai bang Citizen.exists() moi lan, khong the
 * cong/tru truc tiep - vi vi du xoa 1 Citizen co isDisabledChild=true khong co
 * nghia ho dan het "co tre em khuyet tat" neu van con Citizen khac cung co nay.
 * Goi moi khi mot thao tac Citizen (them/sua/xoa/chuyen ho dan) CO THE anh
 * huong den 2 co nay cua ho dan lien quan. An toan de goi thua (idempotent).
 */
export async function recomputeHouseholdFlags(
    householdId: unknown,
): Promise<void> {
    const [hasDisabledChild, hasDisabledPerson] = await Promise.all([
        Citizen.exists({ householdId, isDisabledChild: true }),
        Citizen.exists({ householdId, isDisabledOrSupportNeeded: true }),
    ]);
    await Household.updateOne(
        { _id: householdId },
        {
            hasDisabledChild: !!hasDisabledChild,
            hasDisabledPerson: !!hasDisabledPerson,
        },
    );
}

export async function createCitizen(
    actorUser: IUser,
    input: CreateCitizenInput,
): Promise<ICitizen> {
    const household = await Household.findById(input.householdId);
    if (!household) throw new HttpError("Không tìm thấy hộ dân", 404);
    await assertHouseholdInScope(actorUser, household);
    await assertHouseholdHouseAllowsDeclaration(actorUser, household);

    const actorId = String(actorUser._id);
    const citizen = await Citizen.create({
        fullName: input.fullName,
        phone: input.phone,
        cccd: input.cccd,
        birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
        gender: input.gender ?? "nam",
        relationToHead: input.relationToHead,
        occupation: input.occupation,
        householdId: input.householdId,
        residenceType: input.residenceType ?? "thuong_tru",
        temporaryResidenceStartsAt: input.temporaryResidenceStartsAt
            ? new Date(input.temporaryResidenceStartsAt)
            : undefined,
        temporaryResidenceExpiresAt: input.temporaryResidenceExpiresAt
            ? new Date(input.temporaryResidenceExpiresAt)
            : undefined,
        isResidencyDeclared: input.isResidencyDeclared ?? false,
        isElderly: input.isElderly ?? false,
        isChild: input.isChild ?? false,
        isDisabledOrSupportNeeded: input.isDisabledOrSupportNeeded ?? false,
        isDisabledChild: input.isDisabledChild ?? false,
        isPartyMember: input.isPartyMember ?? false,
        isUnionMember: input.isUnionMember ?? false,
        isMartyr: input.isMartyr ?? false,
        isMartyrFamily: input.isMartyrFamily ?? false,
        isVeteran: input.isVeteran ?? false,
        isOtherSpecial: input.isOtherSpecial ?? false,
        otherSpecialLabel: input.otherSpecialLabel,
        zaloUserId: input.zaloUserId,
        createdBy: actorId,
        updatedBy: actorId,
    });

    await adjustHouseholdMemberCount(input.householdId, 1);
    if (input.isDisabledChild || input.isDisabledOrSupportNeeded) {
        await recomputeHouseholdFlags(input.householdId);
    }

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
    neighborhoodId?: string;
    actorUser: IUser;
}) {
    const isAdminUser = params.actorUser.roles.includes("admin");
    const isHouseOwnerUser = params.actorUser.roles.includes("house_owner");
    const filter: Record<string, unknown> = {};

    if (params.householdId) {
        if (!isAdminUser) {
            const household = await Household.findById(params.householdId);
            if (!household) throw new HttpError("Không tìm thấy hộ dân", 404);
            await assertHouseholdInScope(params.actorUser, household);
        }
        filter.householdId = params.householdId;
    } else if (isHouseOwnerUser) {
        // House_owner (chu nha) chi duoc xem nhan khau thuoc cac ho dan nam
        // trong nha ma minh so huu - khong duoc roi vao clusterScopeFilter ben
        // duoi (rong voi house_owner -> se bi hieu nham la xem duoc toan phuong).
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

    if (params.neighborhoodId) {
        // Loc bo sung theo to dan pho (chon tu dropdown o frontend) - Citizen
        // khong co truong neighborhoodId truc tiep nen phai tra qua Household
        // truoc, roi ket hop (giao) voi dieu kien householdId da co o tren
        // (neu co) thay vi ghi de, tranh no rong pham vi xem cua nguoi dung.
        const householdsInNeighborhood = await Household.find({
            neighborhoodId: params.neighborhoodId,
        }).select("_id");
        const idsInNeighborhood = householdsInNeighborhood.map(h =>
            String(h._id),
        );
        const existingHouseholdFilter = filter.householdId as
            | { $in?: unknown[] }
            | string
            | undefined;
        if (existingHouseholdFilter === undefined) {
            filter.householdId = { $in: idsInNeighborhood };
        } else if (typeof existingHouseholdFilter === "string") {
            filter.householdId = idsInNeighborhood.includes(
                existingHouseholdFilter,
            )
                ? existingHouseholdFilter
                : { $in: [] };
        } else if (Array.isArray(existingHouseholdFilter.$in)) {
            const existingIds = existingHouseholdFilter.$in.map(String);
            filter.householdId = {
                $in: existingIds.filter(id => idsInNeighborhood.includes(id)),
            };
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
        // Cho tim nhan khau qua thong tin ho dan (chu ho/ma ho/dia chi) - vd
        // go ten chu ho de tim tat ca nhan khau trong ho do.
        const matchingHouseholds = await Household.find({
            $or: [
                { code: { $regex: params.search, $options: "i" } },
                { headOfHousehold: { $regex: params.search, $options: "i" } },
                { address: { $regex: params.search, $options: "i" } },
            ],
        }).select("_id");
        if (matchingHouseholds.length > 0) {
            orConditions.push({
                householdId: { $in: matchingHouseholds.map(h => h._id) },
            });
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
    if (!citizen) throw new HttpError("Không tìm thấy nhân khẩu", 404);
    return citizen;
}

export async function updateCitizen(
    actorUser: IUser,
    id: string,
    patch: UpdateCitizenInput,
): Promise<ICitizen> {
    const citizen = await Citizen.findById(id);
    if (!citizen) throw new HttpError("Không tìm thấy nhân khẩu", 404);

    const oldHouseholdId = String(citizen.householdId);
    let newHouseholdId = oldHouseholdId;

    if (patch.householdId && patch.householdId !== oldHouseholdId) {
        const newHousehold = await Household.findById(patch.householdId);
        if (!newHousehold)
            throw new HttpError("Không tìm thấy hộ dân mới", 404);
        await assertHouseholdInScope(actorUser, newHousehold);
        await assertHouseholdHouseAllowsDeclaration(actorUser, newHousehold);
        newHouseholdId = patch.householdId;
    }

    // Chi gan cac truong thuc su co mat trong patch (partial schema van tra ve
    // day du key voi gia tri undefined cho truong khong duoc gui len).
    const {
        birthDate,
        temporaryResidenceStartsAt,
        temporaryResidenceExpiresAt,
        ...rest
    } = patch;
    for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) {
            (citizen as unknown as Record<string, unknown>)[key] = value;
        }
    }
    if (birthDate !== undefined) {
        citizen.birthDate = birthDate ? new Date(birthDate) : undefined;
    }
    if (temporaryResidenceStartsAt !== undefined) {
        citizen.temporaryResidenceStartsAt = temporaryResidenceStartsAt
            ? new Date(temporaryResidenceStartsAt)
            : undefined;
    }
    if (temporaryResidenceExpiresAt !== undefined) {
        citizen.temporaryResidenceExpiresAt = temporaryResidenceExpiresAt
            ? new Date(temporaryResidenceExpiresAt)
            : undefined;
    }
    const actorId = String(actorUser._id);
    citizen.updatedBy = actorId as any;
    await citizen.save();

    if (newHouseholdId !== oldHouseholdId) {
        await adjustHouseholdMemberCount(oldHouseholdId, -1);
        await adjustHouseholdMemberCount(newHouseholdId, 1);
        // Nhan khau mang theo bat ky co isDisabledChild/isDisabledOrSupportNeeded
        // hien co sang ho dan moi - phai tinh lai CA HAI ho dan, khong chi ho dan
        // moi, vi ho dan cu co the mat co neu day la Citizen duy nhat co co do.
        await Promise.all([
            recomputeHouseholdFlags(oldHouseholdId),
            recomputeHouseholdFlags(newHouseholdId),
        ]);
    } else if (
        patch.isDisabledChild !== undefined ||
        patch.isDisabledOrSupportNeeded !== undefined
    ) {
        await recomputeHouseholdFlags(newHouseholdId);
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
    if (!citizen) throw new HttpError("Không tìm thấy nhân khẩu", 404);

    const householdId = citizen.householdId;
    const hadFlags = citizen.isDisabledChild || citizen.isDisabledOrSupportNeeded;
    await citizen.deleteOne();
    await adjustHouseholdMemberCount(householdId, -1);
    if (hadFlags) {
        await recomputeHouseholdFlags(householdId);
    }

    await writeAuditLog({
        actorId,
        action: "citizen.delete",
        targetModel: "Citizen",
        targetId: id,
        metadata: { householdId },
    });

    return citizen;
}
