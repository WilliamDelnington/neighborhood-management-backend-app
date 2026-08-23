import {
    HouseRecord,
    HouseDocument,
    Household,
    HouseholdDocument,
    Company,
    CompanyDocument,
    type IHouseRecord,
    type IHousehold,
    type ICompany,
} from "@/models";
import { assertHouseRecordInScope } from "@/services/houseRecordService";
import { assertHouseholdInScope } from "@/services/householdService";
import {
    isHouseOwnerActor,
    resolveActiveHouseOwnerActingUserIds,
} from "@/services/houseOwnershipService";
import type { RequiredDocumentAdapter } from "@/services/requiredDocumentService";

/**
 * Adapter cho HouseDocument - "chu so huu" o day chinh la HouseRecord, nen
 * khong can resolve qua houseId nhu Household/Company.
 */
export const houseDocumentAdapter: RequiredDocumentAdapter<IHouseRecord> = {
    label: "Nhà số",
    notFoundMessage: "Không tìm thấy nhà số",
    relatedModelName: "HouseDocument",
    verifyPermission: "houses.verify",
    category: "house",
    EntityModel: HouseRecord,
    DocumentModel: HouseDocument,
    entityIdField: "houseId",
    findEntity: id => HouseRecord.findById(id),
    assertScope: (actorUser, entity) =>
        assertHouseRecordInScope(actorUser, entity),
    isOwnerActor: (actorUser, entity) =>
        isHouseOwnerActor(entity._id, actorUser._id),
    resolveNotifyUserIds: entity =>
        resolveActiveHouseOwnerActingUserIds(entity._id),
    getStatus: entity => entity.status,
};

/**
 * Adapter cho HouseholdDocument - Household co the "mo coi" (khong houseId,
 * xem models/Household.ts) va co them headOfHouseholdUserId rieng, nen
 * scope/chu so huu/nguoi nhan thong bao KHONG the suy dien tu HouseRecord nhu
 * House/Company - tai su dung dung cac ham da co cua householdService
 * (assertHouseholdInScope) va cung logic isOwner/notify voi
 * householdService.transitionHouseholdStatus.
 */
export const householdDocumentAdapter: RequiredDocumentAdapter<IHousehold> = {
    label: "Hộ dân",
    notFoundMessage: "Không tìm thấy hộ dân",
    relatedModelName: "HouseholdDocument",
    verifyPermission: "households.verify",
    category: "household",
    EntityModel: Household,
    DocumentModel: HouseholdDocument,
    entityIdField: "householdId",
    findEntity: id => Household.findById(id),
    assertScope: (actorUser, entity) => assertHouseholdInScope(actorUser, entity),
    isOwnerActor: async (actorUser, entity) => {
        if (entity.houseId && (await isHouseOwnerActor(entity.houseId, actorUser._id))) {
            return true;
        }
        return !!(
            entity.headOfHouseholdUserId &&
            String(entity.headOfHouseholdUserId) === String(actorUser._id)
        );
    },
    resolveNotifyUserIds: entity =>
        entity.houseId
            ? resolveActiveHouseOwnerActingUserIds(entity.houseId)
            : Promise.resolve([]),
    getStatus: entity => entity.status,
};

/**
 * Adapter cho CompanyDocument - Company.houseId bat buoc (khac Household)
 * nhung van kiem tra `if (houseRecord)` phong thu giong
 * companyService.updateCompany, phong truong hop nha so bi xoa.
 */
export const companyDocumentAdapter: RequiredDocumentAdapter<ICompany> = {
    label: "Công ty",
    notFoundMessage: "Không tìm thấy công ty",
    relatedModelName: "CompanyDocument",
    verifyPermission: "companies.verify",
    category: "company",
    EntityModel: Company,
    DocumentModel: CompanyDocument,
    entityIdField: "companyId",
    findEntity: id => Company.findById(id),
    assertScope: async (actorUser, entity) => {
        const houseRecord = await HouseRecord.findById(entity.houseId);
        if (houseRecord) await assertHouseRecordInScope(actorUser, houseRecord);
    },
    isOwnerActor: (actorUser, entity) =>
        isHouseOwnerActor(entity.houseId, actorUser._id),
    resolveNotifyUserIds: entity =>
        resolveActiveHouseOwnerActingUserIds(entity.houseId),
    getStatus: entity => entity.status,
};
