import { HouseRecord, Household, Business, type ISurvey, type IUser } from "@/models";
import { getHouseIdsForActingOwner } from "@/services/houseOwnershipService";

export type UserEligibilityContext = {
    streetIds: string[];
    neighborhoodIds: string[];
    businessTypeIds: string[];
};

/**
 * Suy ra street/neighborhood/business type ma mot resident (house_owner) gan
 * voi, de doi chieu voi dieu kien eligibleStreetIds/eligibleNeighborhoodIds/
 * eligibleBusinessTypeIds cua khao sat. Nguon du lieu:
 * - Nha so ma user dang thao tac thay chu nha (primary_owner/co_owner/
 *   authorized_manager, truc tiep hoac qua to chuc dai dien - xem
 *   getHouseIdsForActingOwner), CONG nha so cua ho dan ma user thuoc ve
 *   (user.householdId -> Household.houseId) - phu ca hai truong hop "tu dang
 *   ky nha" lan "duoc them vao ho dan cua nguoi khac".
 * - streetId/neighborhoodId gan truc tiep tren cac nha so do (neighborhoodId
 *   KHONG suy ra tu Street - mot duong/pho co the chay qua nhieu to dan pho).
 * - businessType cua cac Business dat tai cac nha so do.
 */
export async function resolveUserEligibilityContext(
    user: IUser,
): Promise<UserEligibilityContext> {
    const houseRecordIds = new Set<string>();

    const ownedHouseIds = await getHouseIdsForActingOwner(user._id);
    for (const id of ownedHouseIds) houseRecordIds.add(String(id));

    if (user.householdId) {
        const household = await Household.findById(user.householdId).select(
            "houseId",
        );
        if (household?.houseId) houseRecordIds.add(String(household.houseId));
    }

    if (houseRecordIds.size === 0) {
        return { streetIds: [], neighborhoodIds: [], businessTypeIds: [] };
    }

    const houseRecordIdList = [...houseRecordIds];

    const [houseRecords, businesses] = await Promise.all([
        HouseRecord.find({ _id: { $in: houseRecordIdList } }).select(
            "streetId neighborhoodId",
        ),
        Business.find({ houseId: { $in: houseRecordIdList } }).select(
            "businessType",
        ),
    ]);

    const streetIds = [
        ...new Set(
            houseRecords
                .map(h => h.streetId)
                .filter(Boolean)
                .map(id => String(id)),
        ),
    ];

    const neighborhoodIds = [
        ...new Set(
            houseRecords
                .map(h => h.neighborhoodId)
                .filter(Boolean)
                .map(id => String(id)),
        ),
    ];

    const businessTypeIds = [
        ...new Set(
            businesses
                .map(b => b.businessType)
                .filter(Boolean)
                .map(id => String(id)),
        ),
    ];

    return { streetIds, neighborhoodIds, businessTypeIds };
}

/**
 * true neu user duoc phep tra loi khao sat, dua tren eligibleAll/eligibleRoles
 * va (neu co) eligibleStreetIds/eligibleNeighborhoodIds/eligibleBusinessTypeIds.
 * Ngu nghia: role la dieu kien BAT BUOC (neu co chi dinh), con street/
 * neighborhood/business type la OR voi nhau (chi can khop MOT trong ba la du,
 * vi day la cac cach khac nhau de mo ta CUNG mot nhom doi tuong muc tieu).
 */
export function isSurveyEligible(
    survey: ISurvey,
    user: IUser,
    context: UserEligibilityContext,
): boolean {
    if (survey.eligibleAll) return true;

    const eligibleRoles = survey.eligibleRoles || [];
    if (eligibleRoles.length > 0 && !user.roles.some(r => eligibleRoles.includes(r))) {
        return false;
    }

    const eligibleStreetIds = (survey.eligibleStreetIds || []).map(String);
    const eligibleNeighborhoodIds = (survey.eligibleNeighborhoodIds || []).map(
        String,
    );
    const eligibleBusinessTypeIds = (survey.eligibleBusinessTypeIds || []).map(
        String,
    );
    const hasLocationCriteria =
        eligibleStreetIds.length > 0 ||
        eligibleNeighborhoodIds.length > 0 ||
        eligibleBusinessTypeIds.length > 0;
    if (!hasLocationCriteria) return true;

    return (
        eligibleStreetIds.some(id => context.streetIds.includes(id)) ||
        eligibleNeighborhoodIds.some(id => context.neighborhoodIds.includes(id)) ||
        eligibleBusinessTypeIds.some(id => context.businessTypeIds.includes(id))
    );
}
