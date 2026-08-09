import type { Types } from "mongoose";
import {
    HouseOwnership,
    HouseRecord,
    Organization,
    Person,
    User,
    type IHouseOwnership,
    type IHouseRecord,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import {
    ACTING_HOUSE_OWNERSHIP_RELATIONSHIP_TYPES,
    type OwnerType,
} from "@/types";
import type { AddHouseOwnershipInput } from "@/validators/houseOwnership";

/**
 * Tra ve id cua User thuc su "dung sau" mot quan he so huu - giong quy tac
 * resolveOwnerActingUserId cu: ownerType="user" -> chinh ownerId, ownerType=
 * "organization" -> representativeUserId cua to chuc do (undefined neu khong
 * tim thay to chuc hoac to chuc chua co nguoi dai dien dang nhap duoc),
 * ownerType="person" -> luon undefined (danh tinh khai bao, khong co tai
 * khoan dang nhap - xem models/Person.ts).
 */
async function resolveActingUserId(
    ownerType: OwnerType,
    ownerId: Types.ObjectId,
): Promise<Types.ObjectId | undefined> {
    if (ownerType === "user") return ownerId;
    if (ownerType === "person") return undefined;
    const organization = await Organization.findById(ownerId).select(
        "representativeUserId",
    );
    return organization?.representativeUserId;
}

/**
 * Danh sach id User dang "thao tac thay chu nha" cho mot nha so - gom tat ca
 * quan he active co relationshipType nam trong ACTING_HOUSE_OWNERSHIP_RELATIONSHIP_TYPES
 * (primary_owner/co_owner/authorized_manager), da resolve to chuc ve nguoi
 * dai dien va loai trung. Dung cho ca kiem tra quyen (isHouseOwnerActor) lan
 * gui thong bao (moi nguoi thao tac thay deu duoc bao ket qua duyet).
 */
export async function resolveActiveHouseOwnerActingUserIds(
    houseId: Types.ObjectId | string,
): Promise<Types.ObjectId[]> {
    const rows = await HouseOwnership.find({
        houseId,
        active: true,
        relationshipType: { $in: ACTING_HOUSE_OWNERSHIP_RELATIONSHIP_TYPES },
    }).select("ownerType ownerId");

    const resolved = await Promise.all(
        rows.map(row => resolveActingUserId(row.ownerType, row.ownerId)),
    );

    const seen = new Set<string>();
    const result: Types.ObjectId[] = [];
    for (const id of resolved) {
        if (!id) continue;
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(id);
    }
    return result;
}

/**
 * Nhu resolveActiveHouseOwnerActingUserIds nhung nhan MOT DANH SACH houseId -
 * dung khi can biet "ai dang la chu nha thuoc pham vi nay" (vd to truong xem
 * danh sach chu nha trong cac Nha so thuoc to dan pho minh phu trach), thay vi
 * kiem tra tung nha rieng le. Chieu nguoc cua getHouseIdsForActingOwner.
 */
export async function getActingOwnerUserIdsForHouses(
    houseIds: (Types.ObjectId | string)[],
): Promise<Types.ObjectId[]> {
    if (houseIds.length === 0) return [];
    const rows = await HouseOwnership.find({
        houseId: { $in: houseIds },
        active: true,
        relationshipType: { $in: ACTING_HOUSE_OWNERSHIP_RELATIONSHIP_TYPES },
    }).select("ownerType ownerId");

    const resolved = await Promise.all(
        rows.map(row => resolveActingUserId(row.ownerType, row.ownerId)),
    );

    const seen = new Set<string>();
    const result: Types.ObjectId[] = [];
    for (const id of resolved) {
        if (!id) continue;
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(id);
    }
    return result;
}

/**
 * True neu userId dang la mot trong cac nguoi thao tac thay chu nha (xem
 * resolveActiveHouseOwnerActingUserIds) cua nha so nay - thay the pattern cu
 * "resolveOwnerActingUserId(...) rồi so sánh String()" o cac noi kiem tra
 * quyen, gio bao gom ca co_owner/authorized_manager chu khong chi primary_owner.
 */
export async function isHouseOwnerActor(
    houseId: Types.ObjectId | string,
    userId: unknown,
): Promise<boolean> {
    if (!userId) return false;
    const actingIds = await resolveActiveHouseOwnerActingUserIds(houseId);
    return actingIds.some(id => String(id) === String(userId));
}

/**
 * Danh sach houseId ma userId dang thao tac thay chu nha (truc tiep hoac qua
 * to chuc dai dien), theo TAT CA quan he active (khong chi primary_owner) -
 * dung de thay the getOwnedHouseRecordIds cu (chi loc theo HouseRecord.ownerId
 * truc tiep, bo sot co_owner/authorized_manager va nha do to chuc dung ten).
 */
export async function getHouseIdsForActingOwner(
    userId: unknown,
): Promise<Types.ObjectId[]> {
    if (!userId) return [];
    const organizations = await Organization.find({
        representativeUserId: userId,
    }).select("_id");
    const organizationIds = organizations.map(o => o._id);

    const rows = await HouseOwnership.find({
        active: true,
        relationshipType: { $in: ACTING_HOUSE_OWNERSHIP_RELATIONSHIP_TYPES },
        $or: [
            { ownerType: "user", ownerId: userId },
            ...(organizationIds.length
                ? [{ ownerType: "organization", ownerId: { $in: organizationIds } }]
                : []),
        ],
    }).select("houseId");

    const seen = new Set<string>();
    const result: Types.ObjectId[] = [];
    for (const row of rows) {
        const key = String(row.houseId);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(row.houseId);
    }
    return result;
}

/**
 * Resolve ownerId thuc su tu input them/chuyen quan he so huu: uu tien
 * ownerId neu co (da chon qua picker o admin-web-app, kiem tra ton tai);
 * neu khong (ownerType="user" va co phone - nhap tay o mini app, vi
 * house_owner khong co quyen "users.read" de tim theo ObjectId) thi tim tai
 * khoan CO SAN theo so dien thoai va gan them role house_owner neu chua co
 * (nguoi nay se thao tac thay chu nha tren nha nay). KHONG tu tao tai khoan
 * moi qua nhanh phone - tao tai khoan thay nguoi khac can quyen "users.create"
 * rieng (xem houseRecordService.resolveOrCreateHouseOwner, chi danh cho
 * nhan vien duoc cap quyen do).
 */
async function resolveExistingOwnerId(
    actorUser: IUser,
    input: { ownerType: OwnerType; ownerId?: string; phone?: string },
): Promise<Types.ObjectId | string> {
    if (input.ownerId) {
        const exists =
            input.ownerType === "organization"
                ? await Organization.exists({ _id: input.ownerId })
                : await User.exists({ _id: input.ownerId });
        if (!exists) {
            throw new HttpError(
                input.ownerType === "organization"
                    ? "Khong tim thay to chuc"
                    : "Khong tim thay tai khoan",
                404,
            );
        }
        return input.ownerId;
    }

    // Da duoc validator dam bao: ownerType="user" va co phone o nhanh nay.
    const user = await User.findOne({ phone: input.phone });
    if (!user) {
        throw new HttpError(
            "Khong tim thay tai khoan voi so dien thoai nay - nguoi nay can dang ky tai khoan truoc",
            404,
        );
    }
    if (!user.roles.includes("house_owner")) {
        user.roles.push("house_owner");
        await user.save();
        await writeAuditLog({
            actorId: String(actorUser._id),
            action: "user.grant_house_owner_role",
            targetModel: "User",
            targetId: user._id,
        });
    }
    return user._id as Types.ObjectId;
}

/**
 * Dong bo cache HouseRecord.ownerId/ownerType voi ban ghi primary_owner dang
 * active cua nha so (hoac xoa cache neu khong con primary_owner nao) - cac noi
 * doc nhanh (populate, businessService...) van doc truc tiep hai truong nay
 * ma khong can join sang HouseOwnership.
 */
async function syncPrimaryOwnerCache(
    houseId: Types.ObjectId | string,
): Promise<void> {
    const primary = await HouseOwnership.findOne({
        houseId,
        active: true,
        relationshipType: "primary_owner",
    }).select("ownerType ownerId");

    await HouseRecord.updateOne(
        { _id: houseId },
        primary
            ? { ownerType: primary.ownerType, ownerId: primary.ownerId }
            : { $unset: { ownerId: "" }, ownerType: "user" },
    );
}

/**
 * Tao quan he primary_owner ban dau cho mot nha so vua tao (goi tu
 * houseRecordService.createHouseRecord) - bo qua neu ownerId chua xac dinh
 * (nhan vien tao nha ma chua biet chu nha, gan sau qua addHouseOwnership).
 */
export async function createInitialOwnership(
    actorUser: IUser,
    houseId: Types.ObjectId,
    ownerType: OwnerType,
    ownerId: Types.ObjectId | string,
): Promise<IHouseOwnership> {
    const ownership = await HouseOwnership.create({
        houseId,
        ownerType,
        ownerId,
        relationshipType: "primary_owner",
        startDate: new Date(),
        active: true,
        verificationStatus: "waiting_verification",
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });
    await syncPrimaryOwnerCache(houseId);
    return ownership;
}

/**
 * Cap nhat verificationStatus cua quan he primary_owner dang active theo ket
 * qua duyet/tu choi nha so (goi tu houseRecordService.transitionHouseRecordStatus)
 * - khong lam gi neu khong con primary_owner nao active (nha chua co chu).
 */
export async function syncPrimaryOwnershipVerification(
    houseId: Types.ObjectId | string,
    verificationStatus: "verified" | "rejected",
): Promise<void> {
    await HouseOwnership.updateOne(
        { houseId, active: true, relationshipType: "primary_owner" },
        { verificationStatus },
    );
}

/**
 * Danh sach quan he so huu cua mot nha so, dang active truoc / moi nhat truoc,
 * kem ten hien thi (va so dien thoai neu la ca nhan) cua tung chu so huu -
 * ownerId la ref da hinh (User hoac Organization) nen khong dung native
 * populate duoc (xem HouseOwnership model); resolve thu cong theo lo (khong
 * query tung dong) roi gan them vao ket qua tra ve. Nguoi goi da duoc kiem tra
 * quyen xem nha so nay o tang route (assertHouseRecordInScope) nen cung cap
 * ten/so dien thoai o day khong lo them thong tin.
 */
export async function listHouseOwnerships(houseId: string) {
    const rows = await HouseOwnership.find({ houseId }).sort({
        active: -1,
        startDate: -1,
    });

    const userIds = rows
        .filter(r => r.ownerType === "user")
        .map(r => r.ownerId);
    const organizationIds = rows
        .filter(r => r.ownerType === "organization")
        .map(r => r.ownerId);
    const personIds = rows
        .filter(r => r.ownerType === "person")
        .map(r => r.ownerId);

    const [users, organizations, persons] = await Promise.all([
        userIds.length
            ? User.find({ _id: { $in: userIds } }).select("displayName phone")
            : [],
        organizationIds.length
            ? Organization.find({ _id: { $in: organizationIds } }).select(
                  "name",
              )
            : [],
        personIds.length
            ? Person.find({ _id: { $in: personIds } }).select("fullName phone")
            : [],
    ]);
    const userMap = new Map(users.map(u => [String(u._id), u]));
    const organizationMap = new Map(
        organizations.map(o => [String(o._id), o]),
    );
    const personMap = new Map(persons.map(p => [String(p._id), p]));

    return rows.map(row => {
        const plain = row.toObject() as IHouseOwnership & {
            ownerDisplayName?: string;
            ownerPhone?: string;
        };
        if (row.ownerType === "user") {
            const user = userMap.get(String(row.ownerId));
            if (user) {
                plain.ownerDisplayName = user.displayName;
                plain.ownerPhone = user.phone;
            }
        } else if (row.ownerType === "person") {
            const person = personMap.get(String(row.ownerId));
            if (person) {
                plain.ownerDisplayName = person.fullName;
                plain.ownerPhone = person.phone;
            }
        } else {
            const organization = organizationMap.get(String(row.ownerId));
            if (organization) plain.ownerDisplayName = organization.name;
        }
        return plain;
    });
}

/**
 * Xoa toan bo quan he so huu cua mot nha so - goi khi XOA han nha so
 * (houseRecordService.deleteHouseRecord). Khac voi endHouseOwnership (giu lai
 * lich su khi chi ket thuc mot quan he) vi o day chinh nha so khong con ton
 * tai nua nen khong co gi de giu lam lich su.
 */
export async function deleteAllOwnershipsForHouse(
    houseId: Types.ObjectId | string,
): Promise<void> {
    await HouseOwnership.deleteMany({ houseId });
}

/**
 * Ket thuc mot quan he so huu (khong xoa - giu lich su). Neu la primary_owner
 * dang active va khong duoc thay the ngay (xem transferPrimaryOwnership), nha
 * so tro thanh "chua co chu" (giong truong hop nhan vien tao nha ma chua biet
 * chu nha) - cache HouseRecord.ownerId/ownerType duoc xoa theo.
 */
export async function endHouseOwnership(
    actorUser: IUser,
    houseId: string,
    ownershipId: string,
    reason?: string,
): Promise<IHouseOwnership> {
    const ownership = await HouseOwnership.findOne({
        _id: ownershipId,
        houseId,
    });
    if (!ownership) throw new HttpError("Khong tim thay quan he so huu", 404);
    if (!ownership.active) {
        throw new HttpError("Quan he so huu nay da ket thuc truoc do", 409);
    }

    ownership.active = false;
    ownership.endDate = new Date();
    ownership.reason = reason;
    ownership.updatedBy = actorUser._id as any;
    await ownership.save();

    if (ownership.relationshipType === "primary_owner") {
        await syncPrimaryOwnerCache(houseId);
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house.ownership.end",
        targetModel: "HouseOwnership",
        targetId: ownership._id,
        metadata: {
            houseId,
            relationshipType: ownership.relationshipType,
            reason,
        },
    });

    return ownership;
}

/**
 * Chuyen chu so huu chinh (primary_owner) sang nguoi/to chuc khac - ket thuc
 * ban ghi primary_owner dang active (neu co) va tao ban ghi moi, KHONG ghi de
 * (xem HouseOwnership model). Cac quan he co_owner/authorized_manager khac
 * cua nha khong bi anh huong.
 */
export async function transferPrimaryOwnership(
    actorUser: IUser,
    houseId: string,
    input: {
        ownerType: OwnerType;
        ownerId?: string;
        phone?: string;
        reason?: string;
    },
): Promise<IHouseOwnership> {
    const resolvedOwnerId = await resolveExistingOwnerId(actorUser, input);

    const current = await HouseOwnership.findOne({
        houseId,
        active: true,
        relationshipType: "primary_owner",
    });
    if (current) {
        current.active = false;
        current.endDate = new Date();
        current.reason = input.reason || "transferred";
        current.updatedBy = actorUser._id as any;
        await current.save();
    }

    const next = await HouseOwnership.create({
        houseId,
        ownerType: input.ownerType,
        ownerId: resolvedOwnerId,
        relationshipType: "primary_owner",
        startDate: new Date(),
        active: true,
        verificationStatus: "waiting_verification",
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await syncPrimaryOwnerCache(houseId);

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house.ownership.transfer",
        targetModel: "HouseOwnership",
        targetId: next._id,
        metadata: {
            houseId,
            previousOwnershipId: current?._id,
            ownerType: input.ownerType,
            ownerId: resolvedOwnerId,
            reason: input.reason,
        },
    });

    return next;
}

/**
 * Them mot quan he so huu/quan ly moi cho nha so. Neu relationshipType la
 * "primary_owner", uy quyen cho transferPrimaryOwnership (chi mot ban ghi
 * primary_owner active tai mot thoi diem - xem unique index tren model); cac
 * relationshipType con lai duoc phep co nhieu ban ghi active dong thoi (mot
 * nha co the vua co co_owner vua co authorized_manager).
 */
export async function addHouseOwnership(
    actorUser: IUser,
    houseId: string,
    input: AddHouseOwnershipInput,
): Promise<IHouseOwnership> {
    if (input.relationshipType === "primary_owner") {
        return transferPrimaryOwnership(actorUser, houseId, input);
    }

    const resolvedOwnerId = await resolveExistingOwnerId(actorUser, input);

    const duplicate = await HouseOwnership.findOne({
        houseId,
        active: true,
        relationshipType: input.relationshipType,
        ownerType: input.ownerType,
        ownerId: resolvedOwnerId,
    });
    if (duplicate) {
        throw new HttpError(
            "Quan he so huu nay da ton tai va dang active",
            409,
        );
    }

    const ownership = await HouseOwnership.create({
        houseId,
        ownerType: input.ownerType,
        ownerId: resolvedOwnerId,
        relationshipType: input.relationshipType,
        startDate: new Date(),
        active: true,
        verificationStatus: "waiting_verification",
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "house.ownership.add",
        targetModel: "HouseOwnership",
        targetId: ownership._id,
        metadata: {
            houseId,
            relationshipType: input.relationshipType,
            ownerType: input.ownerType,
            ownerId: resolvedOwnerId,
        },
    });

    return ownership;
}
