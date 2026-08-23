import { HouseRecord, Household, Business, User, type ISurvey, type IUser } from "@/models";
import {
    getHouseIdsForActingOwner,
    resolveActiveHouseOwnerActingUserIds,
} from "@/services/houseOwnershipService";

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

/**
 * Tra ve id cua TAT CA user du dieu kien tra loi mot khao sat - dung de gui
 * thong bao "khao sat mo" dung doi tuong (xem surveyService.openSurvey).
 * Phai phan anh CHINH XAC cung ngu nghia voi isSurveyEligible() o tren (role
 * BAT BUOC neu co chi dinh, con street/neighborhood/business type la OR voi
 * nhau) - nhung tinh theo LO (bulk query nguoc: tu dieu kien khao sat ra danh
 * sach nha so/user phu hop) thay vi lap tung user va goi
 * resolveUserEligibilityContext (se ra N+1 query voi so luong user lon).
 */
export async function resolveSurveyRecipientUserIds(
    survey: ISurvey,
): Promise<string[]> {
    if (survey.eligibleAll) {
        const users = await User.find({ roles: "house_owner" }).select("_id");
        return users.map(u => String(u._id));
    }

    const eligibleRoles = survey.eligibleRoles || [];
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

    // Khong co dieu kien vi tri (chi role, hoac khong dieu kien gi ca) - giong
    // isSurveyEligible: role la dieu kien duy nhat (hoac khong co dieu kien nao).
    if (!hasLocationCriteria) {
        const filter = eligibleRoles.length > 0 ? { roles: { $in: eligibleRoles } } : {};
        const users = await User.find(filter).select("_id");
        return users.map(u => String(u._id));
    }

    // Tim cac nha so khop street/neighborhood (OR), roi cong them nha so co
    // Business khop businessType (cung la OR - xem isSurveyEligible).
    const houseOrConditions: Record<string, unknown>[] = [];
    if (eligibleStreetIds.length > 0) {
        houseOrConditions.push({ streetId: { $in: eligibleStreetIds } });
    }
    if (eligibleNeighborhoodIds.length > 0) {
        houseOrConditions.push({ neighborhoodId: { $in: eligibleNeighborhoodIds } });
    }

    const houseIds = new Set<string>();
    if (houseOrConditions.length > 0) {
        const houses = await HouseRecord.find({ $or: houseOrConditions }).select(
            "_id",
        );
        houses.forEach(h => houseIds.add(String(h._id)));
    }
    if (eligibleBusinessTypeIds.length > 0) {
        const businesses = await Business.find({
            businessType: { $in: eligibleBusinessTypeIds },
        }).select("houseId");
        businesses.forEach(b => {
            if (b.houseId) houseIds.add(String(b.houseId));
        });
    }

    if (houseIds.size === 0) return [];
    const houseIdList = [...houseIds];

    // Nguoi dang thao tac thay chu nha (truc tiep hoac qua to chuc dai dien)
    // cua cac nha so tren, CONG thanh vien ho dan (User.householdId) thuoc cac
    // ho dan gan voi cac nha so do - doi xung voi resolveUserEligibilityContext.
    const userIds = new Set<string>();
    const ownerIdLists = await Promise.all(
        houseIdList.map(id => resolveActiveHouseOwnerActingUserIds(id)),
    );
    ownerIdLists.forEach(ids => ids.forEach(id => userIds.add(String(id))));

    const households = await Household.find({
        houseId: { $in: houseIdList },
    }).select("_id");
    const householdIds = households.map(h => String(h._id));
    if (householdIds.length > 0) {
        const householdMembers = await User.find({
            householdId: { $in: householdIds },
        }).select("_id");
        householdMembers.forEach(u => userIds.add(String(u._id)));
    }

    if (eligibleRoles.length === 0) return [...userIds];

    const roleMatchedUsers = await User.find({
        _id: { $in: [...userIds] },
        roles: { $in: eligibleRoles },
    }).select("_id");
    return roleMatchedUsers.map(u => String(u._id));
}
