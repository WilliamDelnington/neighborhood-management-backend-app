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
import { hashPassword } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/services/auditService";
import {
    ACTING_HOUSE_OWNERSHIP_RELATIONSHIP_TYPES,
    ACTING_ORGANIZATION_REPRESENTATIVE_ROLES,
    type OwnerType,
} from "@/types";
import type { AddHouseOwnershipInput } from "@/validators/houseOwnership";
import {
    getActiveRepresentativeUserIds,
    getOrganizationIdsForRepresentative,
} from "@/services/organizationRepresentativeService";

/**
 * Tra ve danh sach id User thuc su "dung sau" mot quan he so huu -
 * ownerType="user" -> chinh ownerId (mot phan tu); ownerType="organization"
 * -> TAT CA nguoi dang la nguoi dai dien "thao tac thay" (legal_representative
 * + authorized_manager) cua to chuc do, co the nhieu hon mot nguoi - xem
 * organizationRepresentativeService.getActiveRepresentativeUserIds;
 * ownerType="person" -> mang rong (danh tinh khai bao, khong co tai khoan
 * dang nhap - xem models/Person.ts).
 */
export async function resolveActingUserIds(
    ownerType: OwnerType,
    ownerId: Types.ObjectId,
): Promise<Types.ObjectId[]> {
    if (ownerType === "user") return [ownerId];
    if (ownerType === "person") return [];
    return getActiveRepresentativeUserIds(ownerId);
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
        rows.map(row => resolveActingUserIds(row.ownerType, row.ownerId)),
    );

    const seen = new Set<string>();
    const result: Types.ObjectId[] = [];
    for (const ids of resolved) {
        for (const id of ids) {
            const key = String(id);
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(id);
        }
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
        rows.map(row => resolveActingUserIds(row.ownerType, row.ownerId)),
    );

    const seen = new Set<string>();
    const result: Types.ObjectId[] = [];
    for (const ids of resolved) {
        for (const id of ids) {
            const key = String(id);
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(id);
        }
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
    const organizationIds = await getOrganizationIdsForRepresentative(
        userId as Types.ObjectId,
        ACTING_ORGANIZATION_REPRESENTATIVE_ROLES,
    );

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
 * (nguoi nay se thao tac thay chu nha tren nha nay).
 *
 * Neu khong tim thay VA input co password + displayName: tao tai khoan moi
 * luon (TAM THOI dung phone+password thay OTP - xem LoginPage.tsx), nhung chi
 * khi actorUser co quyen "users.create" (house_owner tu them dong so huu
 * KHONG duoc tao tai khoan thay nguoi khac qua nhanh nay - phai la nguoi da
 * co quyen tao tai khoan rieng, vd neighborhood_leader/admin). Khong co
 * password/displayName (hoac khong co quyen) -> giu hanh vi cu, bao 404 yeu
 * cau nguoi do tu dang ky truoc (xem houseRecordService.resolveOrCreateHouseOwner
 * cho nhanh tuong tu luc tao nha so).
 */
async function resolveExistingOwnerId(
    actorUser: IUser,
    input: {
        ownerType: OwnerType;
        ownerId?: string;
        phone?: string;
        displayName?: string;
        password?: string;
    },
): Promise<Types.ObjectId | string> {
    if (input.ownerId) {
        const exists =
            input.ownerType === "organization"
                ? await Organization.exists({ _id: input.ownerId })
                : await User.exists({ _id: input.ownerId });
        if (!exists) {
            throw new HttpError(
                input.ownerType === "organization"
                    ? "Không tìm thấy tổ chức"
                    : "Không tìm thấy tài khoản",
                404,
            );
        }
        return input.ownerId;
    }

    // Da duoc validator dam bao: ownerType="user" va co phone o nhanh nay.
    const user = await User.findOne({ phone: input.phone });
    if (!user) {
        if (input.password && input.displayName) {
            await requirePermission(actorUser, "users.create");
            const passwordHash = await hashPassword(input.password);
            let created;
            try {
                created = await User.create({
                    phone: input.phone,
                    displayName: input.displayName,
                    passwordHash,
                    // Mat khau nay do nguoi dai dien/nhan vien dat thay khi
                    // gan chu nha - bat buoc doi ngay lan dang nhap dau tien
                    // (xem User.mustChangePassword va ghi chu tuong tu o
                    // houseRecordService.resolveOrCreateHouseOwner).
                    mustChangePassword: true,
                    roles: ["house_owner"],
                    primaryRole: "house_owner",
                    status: "active",
                    createdBy: actorUser._id,
                });
            } catch (err: any) {
                if (err?.code === 11000) {
                    throw new HttpError("Số điện thoại đã được sử dụng", 409);
                }
                throw err;
            }
            await writeAuditLog({
                actorId: String(actorUser._id),
                action: "user.create_house_owner",
                targetModel: "User",
                targetId: created._id,
            });
            return created._id as Types.ObjectId;
        }
        throw new HttpError(
            "Không tìm thấy tài khoản với số điện thoại này - người này cần đăng ký tài khoản trước",
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
    if (!ownership) throw new HttpError("Không tìm thấy quan hệ sở hữu", 404);
    if (!ownership.active) {
        throw new HttpError("Quan hệ sở hữu này đã kết thúc trước đó", 409);
    }

    // Chinh chu nha (nguoi dung sau quan he so huu nay) khong duoc tu ket thuc
    // truc tiep nua - phai gui ChangeRequest (changeType="unlink") de nhan vien
    // duyet, luc do decideChangeRequest se goi lai chinh ham nay voi actorUser
    // la nguoi duyet (khac actingUserId cua ownership) nen khong bi chan o day.
    const actingUserIds = await resolveActingUserIds(
        ownership.ownerType,
        ownership.ownerId,
    );
    if (
        actingUserIds.some(id => String(id) === String(actorUser._id)) &&
        !actorUser.roles.includes("admin")
    ) {
        throw new HttpError(
            "Vui lòng gửi yêu cầu hủy liên kết thay vì thao tác trực tiếp",
            403,
        );
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
        displayName?: string;
        password?: string;
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
            "Quan hệ sở hữu này đã tồn tại và đang active",
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

/**
 * Xac thuc/tu choi mot quan he co_owner hoac authorized_manager dang cho xac
 * thuc. Khac primary_owner (tu dong dong bo theo trang thai xac minh cua
 * chinh Nha so - xem syncPrimaryOwnershipVerification), cac quan he con lai
 * duoc them SAU khi nha da co chu nen can mot hanh dong xac thuc rieng -
 * truoc ham nay khong ton tai bat ky cach nao (API/UI) de chuyen
 * waiting_verification sang verified/rejected cho co_owner/authorized_manager.
 * Tu choi KHONG tu dong ket thuc quan he (active van giu nguyen) - chi danh
 * dau ket qua xac thuc, nguoi duyet phai tu ket thuc rieng qua
 * endHouseOwnership neu muon go bo hoan toan.
 */
export async function verifyHouseOwnership(
    actorUser: IUser,
    houseId: string,
    ownershipId: string,
    decision: "verified" | "rejected",
    note?: string,
): Promise<IHouseOwnership> {
    const ownership = await HouseOwnership.findOne({
        _id: ownershipId,
        houseId,
        active: true,
    });
    if (!ownership) {
        throw new HttpError("Không tìm thấy quan hệ sở hữu", 404);
    }
    if (ownership.relationshipType === "primary_owner") {
        throw new HttpError(
            "Chủ sở hữu chính được xác thực tự động theo trạng thái xác minh của Nhà số, không xác thực riêng ở đây",
            400,
        );
    }

    ownership.verificationStatus = decision;
    if (note) ownership.reason = note;
    ownership.updatedBy = actorUser._id as any;
    await ownership.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action:
            decision === "verified"
                ? "house.ownership.verify"
                : "house.ownership.reject",
        targetModel: "HouseOwnership",
        targetId: ownership._id,
        metadata: {
            houseId,
            relationshipType: ownership.relationshipType,
            note,
        },
    });

    return ownership;
}
