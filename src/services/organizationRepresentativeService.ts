import type { Types } from "mongoose";
import {
    Organization,
    OrganizationRepresentative,
    type IOrganizationRepresentative,
    type IUser,
} from "@/models";
import { HttpError } from "@/lib/response";
import { writeAuditLog } from "@/services/auditService";
import { assertRepresentativeUser } from "@/services/organizationService";
import {
    ACTING_ORGANIZATION_REPRESENTATIVE_ROLES,
    type OrganizationRepresentativeRole,
} from "@/types";
import type {
    AddOrganizationRepresentativeInput,
    VerifyOrganizationRepresentativeInput,
} from "@/validators/organizationRepresentative";

/**
 * Dong bo cache Organization.representativeUserId/representativeRole voi
 * ban ghi legal_representative dang active (hoac xoa cache neu khong con) -
 * cac noi doc nhanh (populate, resolveActingUserId...) van doc truc tiep hai
 * truong nay ma khong can join. Xem ghi chu tren Organization model.
 */
async function syncPrimaryRepresentativeCache(
    organizationId: Types.ObjectId | string,
): Promise<void> {
    const primary = await OrganizationRepresentative.findOne({
        organizationId,
        active: true,
        role: "legal_representative",
    }).select("userId title");

    await Organization.updateOne(
        { _id: organizationId },
        primary
            ? {
                  representativeUserId: primary.userId,
                  representativeRole: primary.title,
              }
            : {
                  $unset: { representativeUserId: "", representativeRole: "" },
              },
    );
}

/**
 * Danh sach nguoi dai dien cua mot to chuc, dang active truoc / moi nhat
 * truoc - khac listHouseOwnerships, khong can resolve da hinh vi userId luon
 * la User (populate truc tiep duoc).
 */
export async function listOrganizationRepresentatives(organizationId: string) {
    return OrganizationRepresentative.find({ organizationId })
        .sort({ active: -1, startDate: -1 })
        .populate("userId", "displayName phone");
}

/**
 * Chuyen nguoi dai dien phap luat (legal_representative) - ket thuc ban ghi
 * dang active (neu co) va tao ban ghi moi, KHONG ghi de (giu nguyen lich su).
 * Dung ca cho lan dau tien (khong co gi de ket thuc) lan chuyen doi sau nay.
 */
async function transferLegalRepresentative(
    actorUser: IUser,
    organizationId: string,
    input: { userId: string; title?: string; reason?: string },
): Promise<IOrganizationRepresentative> {
    await assertRepresentativeUser(input.userId);

    const current = await OrganizationRepresentative.findOne({
        organizationId,
        active: true,
        role: "legal_representative",
    });
    if (current) {
        current.active = false;
        current.endDate = new Date();
        current.reason = input.reason || "transferred";
        current.updatedBy = actorUser._id as any;
        await current.save();
    }

    const next = await OrganizationRepresentative.create({
        organizationId,
        userId: input.userId,
        role: "legal_representative",
        title: input.title,
        startDate: new Date(),
        active: true,
        verificationStatus: "waiting_verification",
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await syncPrimaryRepresentativeCache(organizationId);

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "organization.representative.transfer",
        targetModel: "OrganizationRepresentative",
        targetId: next._id,
        metadata: {
            organizationId,
            previousRepresentativeId: current?._id,
            userId: input.userId,
            reason: input.reason,
        },
    });

    return next;
}

/**
 * Them mot nguoi dai dien moi cho to chuc. Neu role la "legal_representative",
 * uy quyen cho transferLegalRepresentative (chi mot ban ghi active tai mot
 * thoi diem - xem partial unique index tren model); cac role con lai
 * (authorized_manager, contact_person) duoc phep co nhieu ban ghi active
 * dong thoi.
 */
export async function addOrganizationRepresentative(
    actorUser: IUser,
    organizationId: string,
    input: AddOrganizationRepresentativeInput,
): Promise<IOrganizationRepresentative> {
    if (input.role === "legal_representative") {
        return transferLegalRepresentative(actorUser, organizationId, input);
    }

    await assertRepresentativeUser(input.userId);

    const duplicate = await OrganizationRepresentative.findOne({
        organizationId,
        active: true,
        role: input.role,
        userId: input.userId,
    });
    if (duplicate) {
        throw new HttpError(
            "Quan hệ đại diện này đã tồn tại và đang active",
            409,
        );
    }

    const representative = await OrganizationRepresentative.create({
        organizationId,
        userId: input.userId,
        role: input.role,
        title: input.title,
        startDate: new Date(),
        active: true,
        verificationStatus: "waiting_verification",
        createdBy: actorUser._id,
        updatedBy: actorUser._id,
    });

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "organization.representative.add",
        targetModel: "OrganizationRepresentative",
        targetId: representative._id,
        metadata: { organizationId, role: input.role, userId: input.userId },
    });

    return representative;
}

/**
 * Ket thuc mot quan he dai dien (khong xoa - giu lai lich su). Neu la
 * legal_representative dang active, dong bo lai cache tren Organization
 * (co the tro thanh "chua co nguoi dai dien" neu khong ket thuc kem tao moi).
 */
export async function endOrganizationRepresentative(
    actorUser: IUser,
    organizationId: string,
    representativeId: string,
    reason?: string,
): Promise<IOrganizationRepresentative> {
    const representative = await OrganizationRepresentative.findOne({
        _id: representativeId,
        organizationId,
        active: true,
    });
    if (!representative) {
        throw new HttpError("Không tìm thấy người đại diện", 404);
    }

    representative.active = false;
    representative.endDate = new Date();
    representative.reason = reason;
    representative.updatedBy = actorUser._id as any;
    await representative.save();

    if (representative.role === "legal_representative") {
        await syncPrimaryRepresentativeCache(organizationId);
    }

    await writeAuditLog({
        actorId: String(actorUser._id),
        action: "organization.representative.end",
        targetModel: "OrganizationRepresentative",
        targetId: representative._id,
        metadata: { organizationId, role: representative.role, reason },
    });

    return representative;
}

/**
 * Xac thuc/tu choi mot quan he dai dien dang cho xac thuc. Khong loai tru
 * legal_representative (khac verifyHouseOwnership loai tru primary_owner):
 * Organization khong co truong trang thai xac minh rieng de dong bo xuong nhu
 * House, nen MOI role deu can xac thuc rieng qua day.
 */
export async function verifyOrganizationRepresentative(
    actorUser: IUser,
    organizationId: string,
    representativeId: string,
    decision: VerifyOrganizationRepresentativeInput["decision"],
    note?: string,
): Promise<IOrganizationRepresentative> {
    const representative = await OrganizationRepresentative.findOne({
        _id: representativeId,
        organizationId,
        active: true,
    });
    if (!representative) {
        throw new HttpError("Không tìm thấy người đại diện", 404);
    }

    representative.verificationStatus = decision;
    if (note) representative.reason = note;
    representative.updatedBy = actorUser._id as any;
    await representative.save();

    await writeAuditLog({
        actorId: String(actorUser._id),
        action:
            decision === "verified"
                ? "organization.representative.verify"
                : "organization.representative.reject",
        targetModel: "OrganizationRepresentative",
        targetId: representative._id,
        metadata: { organizationId, role: representative.role, note },
    });

    return representative;
}

/**
 * Danh sach userId dang "dai dien thay" cho mot to chuc (mac dinh chi role
 * duoc coi la thao tac thay - legal_representative + authorized_manager,
 * loai contact_person vi chi mang tinh thong tin) - thay the cho viec doc
 * truc tiep Organization.representativeUserId (chi biet MOT nguoi) o
 * houseOwnershipService.ts.
 */
export async function getActiveRepresentativeUserIds(
    organizationId: Types.ObjectId | string,
    roles: OrganizationRepresentativeRole[] = ACTING_ORGANIZATION_REPRESENTATIVE_ROLES,
): Promise<Types.ObjectId[]> {
    const rows = await OrganizationRepresentative.find({
        organizationId,
        active: true,
        role: { $in: roles },
    }).select("userId");
    return rows.map(r => r.userId);
}

/**
 * Danh sach organizationId ma userId dang la nguoi dai dien active - mac
 * dinh khong loc role (dung cho pham vi danh sach to chuc, xem
 * organizationService.organizationScopeFilter - contact_person van nen thay
 * duoc to chuc cua minh trong danh sach). Truyen roles de gioi han chi cac
 * role "dang thao tac thay" (vd houseOwnershipService.getHouseIdsForActingOwner
 * chi quan tam legal_representative/authorized_manager). Thay the cho
 * Organization.find({representativeUserId: userId}) cu (chi biet duoc to
 * chuc ma nguoi do la legal_representative).
 */
export async function getOrganizationIdsForRepresentative(
    userId: Types.ObjectId | string,
    roles?: OrganizationRepresentativeRole[],
): Promise<Types.ObjectId[]> {
    return OrganizationRepresentative.distinct("organizationId", {
        userId,
        active: true,
        ...(roles ? { role: { $in: roles } } : {}),
    });
}

/**
 * True neu userId la nguoi dai dien dang active cua to chuc (BAT KY role nao,
 * ke ca contact_person) - dung cho pham vi xem/quan ly to chuc noi chung
 * (assertOrganizationInScope), rong hon getActiveRepresentativeUserIds (chi
 * loc role "dang thao tac thay").
 */
export async function isOrganizationRepresentativeActor(
    organizationId: Types.ObjectId | string,
    userId: unknown,
): Promise<boolean> {
    if (!userId) return false;
    const exists = await OrganizationRepresentative.exists({
        organizationId,
        userId,
        active: true,
    });
    return Boolean(exists);
}
